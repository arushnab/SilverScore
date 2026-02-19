
import React from 'react';
import { Link } from 'react-router-dom';
import './navbar.css';
import SearchBar from './searchBar';

const Navbar = ({searchResult, setSearchResult}) => {
  return (
    <header className="navbar">

        <div className="left-section">

          <img src="Silver_Score_Centered_NoBackground.png" alt="Logo" className="logo" />

       
       <Link to="/" className="title-link">
          <div className="title">Silver Score</div>
        </Link>
        </div>

        <ul className="nav_features">
          <li className="nav-item"><Link to="/Reviews">Review</Link></li>
          <li className="nav-item"><Link to="/Watchlist">Watchlist</Link></li>
          <li className="nav-item"><Link to="/Explore">Explore</Link></li>
    {/* <li className="nav-item"> <Link to="/Profile"><button>Profile</button></Link> </li> */}
            
        </ul>
      
    </header>
  );
};

export default Navbar;
