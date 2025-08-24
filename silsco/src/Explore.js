import React, { useState, useEffect } from 'react';
import './Explore.css';
import MovieList from './MovieList';
import SearchBar from './searchBar';
import AddWatch from './AddWatch';
import WriteReview from './WriteReview';
import { useNavigate } from 'react-router-dom';

function Explore() {

    const [movies, setMovies] = useState([]);
    const [bookmark, setBookmark] = useState([]);
    const [searchResult, setSearchResult] = useState('');
    const [review, setReview] = useState('false');
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [recommended, setRecommended] = useState([]);
    const [recLoading, setRecLoading] = useState(false);
    const [recError, setRecError] = useState('');
    const navigate = useNavigate();


    const getMovieRequest = async () => {
        
        const url = `https://hy49g605p2.execute-api.us-east-1.amazonaws.com/prod/movies?q=${searchResult}`;
        try {
            const response = await fetch(url);
            const responseJson = await response.json();

            if (responseJson.Search) {
                setMovies(responseJson.Search);
            }

        }

        catch (error) {
            console.error("Error fetching movies from API", error);
        }
    };



    useEffect(() => {
        if (searchResult) {
            getMovieRequest();
        }
    }, [searchResult]);



    const addBookmark = async (movie) => {
        const url = `https://hy49g605p2.execute-api.us-east-1.amazonaws.com/prod/addToWatch`; 
    
        try {
            const response = await fetch(url, {
                method: 'POST',  
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(movie), 
            });
    
            const data = await response.json();
            if (response.ok) {
                console.log("Movie succcesfully added to watchlist", data.message);
                localStorage.removeItem('recs-v1'); 
                fetchRecommended(); 
            } else {
                console.error("Failed to add movie to watchlist:", data.message);
            }
        } catch (error) {
            console.error("Error adding movie to watchlist:", error);
        }
    };

    const handleReviewClick = (movie) => {
        navigate('/Reviews', { state: { movie } });
      };
    
    
    function setWithTTL(key, value, ttlMs){
        const record = { value, exp: Date.now() + ttlMs};
        localStorage.setItem(key, JSON.stringify(record));
      }
    function getWithTTL(key){
        const raw = localStorage.getItem(key);
        if(!raw) return null;
        const {value, exp} = JSON.parse(raw);
        if (Date.now()>exp) {
            localStorage.removeItem(key);
            return null;
        }
        return value;
      }
    
    
function normalizeTitle(s='') { return s.toLowerCase().replace(/[^a-z0-9]+/g,'').trim(); }

async function enrichRecWithPoster(rec) {
  const url = `https://hy49g605p2.execute-api.us-east-1.amazonaws.com/prod/movies?q=${encodeURIComponent(rec.title)}`;
  const res = await fetch(url);
  const data = await res.json();
  const hits = Array.isArray(data.Search) ? data.Search : [];

  const byId = hits.find(h => h.imdbID === rec.imdbID);
  if (byId && byId.Poster && byId.Poster !== 'N/A') return byId;

  const seedNorm = normalizeTitle(rec.title);
  const byTitle = hits.find(h => normalizeTitle(h.Title) === seedNorm && h.Poster && h.Poster !== 'N/A');
  if (byTitle) return byTitle;

  return hits.find(h => h.Poster && h.Poster !== 'N/A');
}

async function fetchRecommended() {
  setRecError('');
  setRecLoading(true);
  try {

    const cached = getWithTTL('recs-v1');
    if (cached) {
         setRecommended(cached); 
         setRecLoading(false);
         return;
     }

  
    const base = 'https://hy49g605p2.execute-api.us-east-1.amazonaws.com/prod/recommendations';
    const res = await fetch(`${base}?mode=user`);
    const json = await res.json();
    const raw = (json && Array.isArray(json.recommendations)) ? json.recommendations : [];


    const enriched = await Promise.all(raw.map(enrichRecWithPoster));
    const finalList = enriched.filter(Boolean); // drop nulls

    setRecommended(finalList);
    setWithTTL('recs-v1', finalList, 1000 * 60 * 60 * 6); // 6h TTL
  } catch (e) {
    console.error(e);
    setRecError('Could not load recommendations.');
  } finally {
    setRecLoading(false);
  }
}

useEffect(() => { fetchRecommended(); }, []);
useEffect(() => {
  const onInvalidate = () => { fetchRecommended(); };
  window.addEventListener('recs:invalidate', onInvalidate);
  return () => window.removeEventListener('recs:invalidate', onInvalidate);
}, []);

    return (

        <div className='Explore'>
            <div className='topExplore'>
                <div className='discover-title'> Discover Your Next Favorite Movie </div>
                <div className='search-wrapper'>
                    <SearchBar searchResult={searchResult} setSearchResult={setSearchResult} />
                </div>
            </div>

        {!searchResult && (
      <div className="row">
        <div className="discover-title" style={{ marginBottom: 8 }}>
          Recommended for you
        </div>

        {recLoading && <div style={{ color: '#999' }}>Loading recommendations…</div>}
        {recError && <div style={{ color: 'crimson' }}>{recError}</div>}

        {!recLoading && !recError && recommended.length > 0 && (
          <MovieList
            movies={recommended}
            handleBookmarkClick={addBookmark}
            handleReviewClick={handleReviewClick}
            plusComponent={AddWatch}
          />
        )}

        {!recLoading && !recError && recommended.length === 0 && (
          <div style={{ color: '#999' }}>No recommendations yet.</div>
        )}
      </div>
    )}

    {/*current search results */}
    {searchResult && (
      <div className="row">
        <MovieList
          movies={movies}
          handleBookmarkClick={addBookmark}
          handleReviewClick={handleReviewClick}
          plusComponent={AddWatch}
        />
      </div>
    )}
  </div>
);
}


export default Explore;
