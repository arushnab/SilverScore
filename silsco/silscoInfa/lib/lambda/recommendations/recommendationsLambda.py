import os, json, time
import urllib.request, urllib.parse
from urllib.error import HTTPError, URLError
from collections import Counter

import boto3
import numpy as np
import pandas as pd
from difflib import SequenceMatcher
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# CONSTANTS
SIM_FLOOR = 0.05
RATING_FLOOR = 6.2
VOTES_FLOOR_PRIMARY = 15000
VOTES_FLOOR_BACKOFF = 3000
TIME_BUDGET_MS = 23000
TMDB_PAGES = 3
TMDB_VOTECOUNT_GTE = 3000

TMDB_GENRES = {
    "action": 28, "adventure": 12, "animation": 16, "comedy": 35, "crime": 80,
    "documentary": 99, "drama": 18, "family": 10751, "fantasy": 14, "history": 36,
    "horror": 27, "music": 10402, "mystery": 9648, "romance": 10749, "sci-fi": 878,
    "science fiction": 878, "tv movie": 10770, "thriller": 53, "war": 10752, "western": 37
}
TMDB_GENRES_REV = {v: k for k, v in TMDB_GENRES.items()}  # id -> lc name

# PARSERS
def parseFloat(x):
    try:
        return float(str(x).replace(",", ""))
    except Exception:
        return None

def parseInt(x):
    try:
        return int(str(x).replace(",", ""))
    except Exception:
        return None

def parseYear(y):
    try:
        s = str(y)
        if len(s) >= 4:
            return int(s[:4])
        return None
    except Exception:
        return None

def safeGet(d, k, default=""):
    v = d.get(k)
    return v if v is not None else default

# SECRETS
_SECRETS_CACHE = {}

def _getSecret(secretName, keyName=None):
    if not secretName:
        raise RuntimeError("secretName env not set")
    if (secretName, keyName) in _SECRETS_CACHE:
        return _SECRETS_CACHE[(secretName, keyName)]
    client = boto3.client('secretsmanager')
    resp = client.get_secret_value(SecretId=secretName)
    secret = resp.get("SecretString") or ""
    try:
        obj = json.loads(secret)
        val = obj[keyName] if keyName else next(iter(obj.values()))
    except Exception:
        val = secret.strip()
    _SECRETS_CACHE[(secretName, keyName)] = val
    return val

def getTmdbApiKey():
    name = os.environ.get("TMDB_SECRET_NAME")
    try:
        return _getSecret(name, "TMDB_API_KEY")
    except Exception:
        return _getSecret(name, None)

# TMDB API HELPERS
def _tmdbGet(path, params):
    params = {**params, "api_key": getTmdbApiKey()}
    url = f"https://api.themoviedb.org/3{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        print(f"TMDB HTTPError {e.code} for {path}: {body}")
        raise
    except URLError as e:
        print("TMDB URLError:", e)
        raise

def _titleSim(a, b):
    return SequenceMatcher(None, (a or "").lower().strip(), (b or "").lower().strip()).ratio()

def tmdbSearchByTitle(title):
    data = _tmdbGet("/search/movie", {"query": title, "include_adult": "false"})
    results = data.get("results") or []
    if not results:
        return None
    
    best = max(results, key=lambda m: (_titleSim(title, m.get("title") or m.get("original_title") or ""), m.get("popularity") or 0))
    return _tmdbGet(f"/movie/{best['id']}", {"append_to_response": ""})

def tmdbDetailsFromImdb(imdbID):
    found = _tmdbGet(f"/find/{imdbID}", {"external_source": "imdb_id"})
    hits = (found.get("movie_results") or [])
    if not hits:
        return None
    tmdbId = hits[0]["id"]
    return _tmdbGet(f"/movie/{tmdbId}", {"append_to_response": ""})

def _seedPrimaryGenreName(seed):
    genres = seed.get("genres") or []
    if genres:
        name = (genres[0].get("name") or "").lower()
        if name:
            return name
        gid = genres[0].get("id")
        return TMDB_GENRES_REV.get(gid, "")
    return ""

def harvestCandidates(seed, maxHits=120, nowMs=None):
    if nowMs is None:
        nowMs = int(time.time() * 1000)

    def timeLeft():
        return TIME_BUDGET_MS - (int(time.time() * 1000) - nowMs)

    seedGenreName = _seedPrimaryGenreName(seed)
    seedGenreId = TMDB_GENRES.get(seedGenreName)
    seedLang = safeGet(seed, "original_language", "").lower()
    seedYear = parseYear(safeGet(seed, "release_date", ""))

    paramsBase = {
        "sort_by": "vote_count.desc",
        "vote_count.gte": TMDB_VOTECOUNT_GTE,
        "include_adult": "false",
        "page": 1
    }
    if seedGenreId:
        paramsBase["with_genres"] = seedGenreId
    if seedLang:
        paramsBase["with_original_language"] = seedLang
    if seedYear:
        paramsBase["primary_release_date.gte"] = f"{max(1900, seedYear-8)}-01-01"
        paramsBase["primary_release_date.lte"] = f"{seedYear+8}-12-31"

    out = []
    seenTmdbIds = set()
    for p in range(1, TMDB_PAGES + 1):
        if timeLeft() <= 3000:
            break
        params = dict(paramsBase); params["page"] = p
        try:
            data = _tmdbGet("/discover/movie", params)
        except Exception:
            break
        results = data.get("results") or []
        if not results:
            break
        for m in results:
            if timeLeft() <= 2000:
                break
            mid = m.get("id")
            if not mid or mid in seenTmdbIds:
                continue
            seenTmdbIds.add(mid)
            out.append({
                "tmdbId": mid,
                "title": m.get("title") or m.get("original_title") or "",
                "overview": m.get("overview") or "",
                "genreIds": m.get("genre_ids") or [],
                "language": (m.get("original_language") or "").lower(),
                "releaseDate": m.get("release_date") or "",
                "voteAverage": m.get("vote_average"),
                "voteCount": m.get("vote_count")
            })
            if len(out) >= maxHits:
                break
        if len(out) >= maxHits:
            break
    return out


def buildTagsTmdb(movie):
    genreNames = [TMDB_GENRES_REV.get(g, "") for g in (movie.get("genreIds") or [])]
    parts = [
        " ".join([g for g in genreNames if g]),
        movie.get("overview") or "",
        movie.get("title") or "",
        movie.get("language") or ""
    ]
    return " ".join(parts).lower().strip()

def buildRowsTmdb(candidates, votesFloor):
    stats = {"detailMiss": 0, "badVotes": 0, "badRating": 0, "kept": 0}
    rows = []
    for m in candidates[:200]:
        rating = parseFloat(m.get("voteAverage"))
        votes = parseInt(m.get("voteCount"))
        year = parseYear(m.get("releaseDate"))
        if votes is None or votes < votesFloor:
            stats["badVotes"] += 1
            continue
        if rating is None or rating < RATING_FLOOR:
            stats["badRating"] += 1
            continue
        primaryGenre = ""
        gids = m.get("genreIds") or []
        if gids:
            primaryGenre = TMDB_GENRES_REV.get(gids[0], "")
        rows.append({
            "tmdbId": m.get("tmdbId"),
            "title": m.get("title") or "",
            "tags": buildTagsTmdb(m),
            "rating": rating,
            "votes": votes,
            "year": year,
            "primaryGenre": primaryGenre,
            "language": m.get("language") or "",
        })
        stats["kept"] += 1
    return rows, stats

def rankTmdb(seed, rows):
    if not rows:
        return {"recs": [], "topTitles": []}
    candDf = pd.DataFrame(rows)

    seedGenre = _seedPrimaryGenreName(seed)
    seedLang = (seed.get("original_language") or "").lower()

    mask = (candDf["primaryGenre"] == seedGenre) | (candDf["language"] == seedLang)
    gated = candDf[mask] if mask.any() else candDf

    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=1)
    candMat = vec.fit_transform(gated["tags"])
    seedTags = " ".join([
        seedGenre,
        safeGet(seed, "overview", ""),
        safeGet(seed, "title", "") or safeGet(seed, "original_title", ""),
        seedLang
    ]).lower()
    seedVec = vec.transform([seedTags])
    sim = cosine_similarity(seedVec, candMat).ravel()
    sim = np.where(sim >= SIM_FLOOR, sim, 0.0)

    qual = (gated["rating"] / 10.0) * (np.clip(gated["votes"], 0, 50000) / 50000.0)

    seedYear = parseYear(safeGet(seed, "release_date", ""))
    candYears = gated["year"].fillna(seedYear).to_numpy()
    if seedYear is None:
        yearPen = np.ones_like(sim)
    else:
        gap = np.abs(candYears - seedYear)
        yearPen = 1.0 / (1.0 + np.maximum(0, gap - 8) ** 2 / 100.0)

    final = (0.65 * sim + 0.30 * qual) * yearPen

    top = gated.assign(score=final)
    top = top[top["score"] > 0]
    top = top.sort_values("score", ascending=False).head(10)
    recs = top[["title", "score"]].to_dict(orient="records")
    return {"recs": recs, "topTitles": top["title"].tolist()}

# WATCHLIST
def getWatchlistSeeds(k=5):
    table = boto3.resource('dynamodb').Table(os.environ['USERTABLE'])
    resp = table.get_item(Key={'userId': 'globalWatchlist'})
    item = resp.get('Item', {}) or {}
    wl = item.get('watchlist') or []
    return wl[-k:]

def combineSeedsTmdb(seeds):
    titles = ", ".join([safeGet(s, "title", "") for s in seeds if s])
    over = ". ".join([safeGet(s, "overview", "") for s in seeds if s])

    langs = [safeGet(s, "original_language", "").lower() for s in seeds if s]
    lang = Counter(langs).most_common(1)[0][0] if langs else ""

    genres = []
    for s in seeds:
        for g in (s.get("genres") or []):
            name = (g.get("name") or "").lower()
            if name:
                genres.append(name)
    mainGenre = genres[0] if genres else ""

    years = [parseYear(safeGet(s, "release_date", "")) for s in seeds if safeGet(s, "release_date", "")]
    year = max([y for y in years if y is not None], default=None)

    return {
        "title": titles,
        "overview": over,
        "original_language": lang,
        "genres": [{"name": mainGenre}] if mainGenre else [],
        "release_date": str(year) if year else ""
    }

def _resp(code, obj):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        "body": json.dumps(obj)
    }

def lambda_handler(event, context):
    try:
        if event.get("httpMethod") == "OPTIONS":
            return _resp(204, {})

        startMs = int(time.time() * 1000)
        params = event.get("queryStringParameters") or {}
        mode = (params.get("mode") or "similar").lower()

        if mode == "diag":
            okTmdb = bool(getTmdbApiKey())
            okUser = bool(os.environ.get("USERTABLE"))
            return _resp(200, {"tmdbKeyPresent": okTmdb, "userTableSet": okUser})

        if mode == "similar":
            title = params.get("title")
            if not title:
                return _resp(400, {"error": "Missing 'title' query parameter"})

            seed = tmdbSearchByTitle(title)
            if not seed:
                return _resp(404, {"error": f"Title not found via TMDB: {title}"})

            candidates = harvestCandidates(seed, maxHits=120, nowMs=startMs)
            seedTmdbId = seed.get("id")
            candidates = [c for c in candidates if c.get("tmdbId") != seedTmdbId]
            rawN = len(candidates)

            rows1, stats1 = buildRowsTmdb(candidates, VOTES_FLOOR_PRIMARY)
            rows, stats = rows1, stats1
            if len(rows) < 5:
                rows2, stats2 = buildRowsTmdb(candidates, VOTES_FLOOR_BACKOFF)
                have = {r["tmdbId"] for r in rows}
                rows += [r for r in rows2 if r["tmdbId"] not in have]
                stats = {
                    "detailMiss": stats1["detailMiss"] + stats2["detailMiss"],
                    "badVotes": stats1["badVotes"] + stats2["badVotes"],
                    "badRating": stats1["badRating"] + stats2["badRating"],
                    "kept": len(rows)
                }

            ranked = rankTmdb(seed, rows)
            payload = {
                "mode": "similar",
                "seed": safeGet(seed, "title", ""),
                "recommendations": ranked["recs"],
            }
            if params.get("debug") == "1":
                payload["debug"] = {
                    "rawCandidates": rawN,
                    "filtered": len(rows),
                    "dropReasons": stats,
                    "top": ranked["topTitles"],
                    "usedFallback": False,
                    "durationMs": int(time.time() * 1000) - startMs,
                    "budgetMs": TIME_BUDGET_MS
                }
            return _resp(200, payload)

        elif mode == "user":
            seedItems = getWatchlistSeeds(k=5)
            seedIds = [x.get("imdbID") for x in seedItems if x.get("imdbID")]
            seeds = []
            for i in seedIds:
                try:
                    s = tmdbDetailsFromImdb(i)
                except Exception:
                    s = None
                if s:
                    seeds.append(s)

            if not seeds:
                return _resp(200, {"error": "Watchlist is empty"})

            candidateMap = {}
            for s in seeds:
                for c in harvestCandidates(s, maxHits=120, nowMs=startMs):
                    candidateMap[c["tmdbId"]] = c
            seedTmdbIds = {s.get("id") for s in seeds}
            candidates = [c for tid, c in candidateMap.items() if tid not in seedTmdbIds]
            rawN = len(candidates)

            rows1, stats1 = buildRowsTmdb(candidates, VOTES_FLOOR_PRIMARY)
            rows, stats = rows1, stats1
            if len(rows) < 5:
                rows2, stats2 = buildRowsTmdb(candidates, VOTES_FLOOR_BACKOFF)
                have = {r["tmdbId"] for r in rows}
                rows += [r for r in rows2 if r["tmdbId"] not in have]
                stats = {
                    "detailMiss": stats1["detailMiss"] + stats2["detailMiss"],
                    "badVotes": stats1["badVotes"] + stats2["badVotes"],
                    "badRating": stats1["badRating"] + stats2["badRating"],
                    "kept": len(rows)
                }

            combinedSeed = combineSeedsTmdb(seeds)
            ranked = rankTmdb(combinedSeed, rows)

            payload = {
                "mode": "user",
                "seed": ", ".join([safeGet(s, "title", "") for s in seeds[:3]]),
                "recommendations": ranked["recs"],
            }
            if params.get("debug") == "1":
                payload["debug"] = {
                    "rawCandidates": rawN,
                    "filtered": len(rows),
                    "dropReasons": stats,
                    "top": ranked["topTitles"],
                    "usedFallback": False,
                    "durationMs": int(time.time() * 1000) - startMs,
                    "budgetMs": TIME_BUDGET_MS
                }
            return _resp(200, payload)

        else:
            return _resp(400, {"error": f"Unknown mode: {mode}"})

    except Exception as e:
        import traceback
        print("UNCAUGHT ERROR\n", traceback.format_exc())
        return _resp(500, {"error": "internal"})
