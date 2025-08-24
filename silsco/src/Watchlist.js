import React, {useState, useEffect} from 'react';
import './Watchlist.css';

import MovieList from './MovieList';
import RemoveWatch from './RemoveWatch';
import { useNavigate } from 'react-router-dom';



  function Watchlist ()  {

const [review, setReview] = useState(false);
const [selectedMovie, setSelectedMovie] = useState(null);
const navigate = useNavigate();


const handleReviewClick = (movie) => {
  navigate('/Reviews', { state: { movie } });
};



    const [bookmark, setBookmark]=useState([]);
    
    useEffect(() => {
    const fetchWatchlist= async()=>{
      const apiUrl= 'https://hy49g605p2.execute-api.us-east-1.amazonaws.com/prod/watchlist';
      try{
        const response= await fetch(apiUrl);
        const responseJSON= await response.json();
        const unDuplicate = Array.from(new Map(responseJSON.map(movie => [movie.imdbID, movie])).values());

        setBookmark(unDuplicate);
      }
      catch(error){
        console.log('Error fetching watchlist', error);
      }
    };

    fetchWatchlist();
  }, []); 

 

  const removeBookmark = async (movie) => {
  const prev = bookmark;
  const next = prev.filter(x => x.imdbID !== movie.imdbID);
  setBookmark(next);

  try {
    const resp = await fetch('https://hy49g605p2.execute-api.us-east-1.amazonaws.com/prod/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imdbID: movie.imdbID })
    });

    if (resp.ok) {
      const data = await resp.json();
      console.log('Backend delete response:', data);
      localStorage.removeItem('recs-v1');
      window.dispatchEvent(new Event('recs:invalidate'));
    } else {
      console.error('Failed to remove from backend:', await resp.text());
      setBookmark(prev); 
    }
  } catch (err) {
    console.error('Failed to remove from backend:', err);
    setBookmark(prev); 
  }
};

  
    

    return(
      

      <div className ="Watchlist">
       
         <div className='watchlist-title'> Your Watchlist: The Perfect Selection for Your Next Movie Night </div>
         <div className= "movie-container">
   <MovieList
                    movies={bookmark}
                    handleBookmarkClick={removeBookmark}
                    plusComponent={RemoveWatch}
                    handleReviewClick={handleReviewClick}
                />

</div>
      </div>
      
    );
  };

  export default Watchlist;