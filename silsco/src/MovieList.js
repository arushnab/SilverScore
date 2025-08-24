

import React from 'react';
import './MovieList.css'; 
import WriteReview from './WriteReview';
const MovieList = (props) => {
    const PlusComponent = props.plusComponent;
    const adjustedMovies = props.movies.filter(movie => movie.Poster !== "N/A"&& movie.Poster !== "" && movie.Poster !== null &&movie.Type =="movie");

    return (
        <>

            <div className="carousel-container">
                <div className="carousel">


                    {adjustedMovies.map((movie, index) => (

                        <div key={movie.imdbID} className ="img-container">

                            <img src={movie.Poster} alt='hi movie' />
                            <div className="movie-title">{movie.Title}</div>
                            <div className="poster-overlay">
                                 <div onClick={() => props.handleBookmarkClick(movie)}>
                                      <PlusComponent />
                                 </div>
                                 <div className="write-review-wrapper" onClick={() => props.handleReviewClick(movie)}>
                                     <WriteReview />
                                </div>
                            </div> 
                        </div>

                    ))}



                </div>

            </div>




        </>
    );


};

export default MovieList;