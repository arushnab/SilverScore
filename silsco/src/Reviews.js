
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Reviews.css';

function Reviews() {
  const location = useLocation();
  const movie = location.state?.movie;

  const [reviewText, setReviewText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [storedReviews, setStoredReviews] = useState([]);

  useEffect(() => {
    if (!movie) {
      fetch('https://hy49g605p2.execute-api.us-east-1.amazonaws.com/prod/reviews')
        .then(res => res.json())
        .then(data => setStoredReviews(data))
        .catch(err => console.error('Error fetching reviews:', err));
    }
  }, [movie]);
  

  const handleSubmit = async () => {
    const reviewData = {
      imdbID: movie.imdbID,
      title: movie.Title,
      poster: movie.Poster,
      review: reviewText,
    };
  
    try {
      const response = await fetch('https://hy49g605p2.execute-api.us-east-1.amazonaws.com/prod/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData),
      });
  
      if (response.ok) {
        setSubmitted(true);
      } else {
        console.error('Failed to submit review');
      }
    } catch (err) {
      console.error('Error submitting review:', err);
    }
  };
  

  return (
    <div className="reviews-page">
      {movie ? (
        <div className="review-split-container">
          {/* Left: Movie Poster */}
          <div className="poster-section">
            <img src={movie.Poster} alt={movie.Title} className="review-poster" />
          </div>

          {/* Right: Review Form */}
          <div className="form-section">
            <h2>{movie.Title}</h2>
            {!submitted ? (
              <>
                <textarea
                  className="review-textarea"
                  placeholder="Type your review here..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />
                <br />
                <button className="submit-button" onClick={handleSubmit}>
                  Submit
                </button>
              </>
            ) : (
              <p>Review Submitted!</p>
            )}
          </div>
        </div>
      ) : (
        <div className="review-default">
  <h2>Your Reviews</h2>
  {storedReviews.length === 0 ? (
    <p>You haven't written any reviews yet.</p>
  ) : (
    <div className="review-list">
      {storedReviews.map((rev, i) => (
        <div key={i} className="stored-review">
          <img src={rev.poster} alt={rev.title} className="stored-poster" />
          <div className="stored-content">
  <h3>{rev.title}</h3>
  <p>{rev.review}</p>

  <div className="spacer"></div>  {/* pushes content up */}
  
  <div className="review-date">
    <small>{new Date(rev.timestamp).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })}</small>
  </div>
</div>

        </div>
      ))}
    </div>
  )}
</div>
      )}
    </div>
  );
}

export default Reviews;