
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route,Link } from "react-router-dom";
import './App.css';

import MovieList from './MovieList';
import Navbar from './navbar';
import Watchlist from './Watchlist';
import Reviews from './Reviews';
import Profile from './Profile';
import Explore from './Explore';
import axios from 'axios';
import SearchBar from './searchBar'; 

function App(){
  return (
   <Router>

      <Navbar />

      <Routes> 
        <Route
          path="/"
          element={

            <div className="Home">

              <b> Welcome to Silver Score! Discover, rate, and review your favorite movies. Keep track of what to watch next with your personal watchlist, and explore a world of films waiting for your take. </b>

              <div className="page-containers">
                <Link to ="/Explore" className="square">

                <div id="discover" className="square">
                  <img src="/corner_of_laptop_with_mouse.jpeg" alt="Discover Photo" className="box-image" />
                  <div className="overlay">
                    <span class="square-text">Explore</span>
                  </div>
                </div>
                </Link>
               <Link to ="/Reviews" className="square">
                <div id="review" className="square">
                  <img src="/blank_lined_notepad_with_pen.jpeg" alt="Review Photo" className="box-image" />
                  <div className="overlay">
                    <span class="square-text">Review</span>
                  </div>
                </div>
                </Link>

                <Link to ="/Watchlist" className="square">
                <div id="watchlist" className="square">
                  <img src="/corner_of_laptop_with_mouse.jpeg" alt="Watchlist Photo" className="box-image" />
                  <div className="overlay">
                    <span class="square-text">Watchlist</span>
                  </div>
                </div>
                </Link>


              </div>
              
         
            </div>
          }
        />


        <Route path="/Profile" element={<Profile />} />
        <Route path="/Reviews" element={<Reviews />} />
        <Route path="/Watchlist" element={<Watchlist/> } />
        <Route path="/Explore" element={<Explore />}/> 


      </Routes>


    </Router>

  );
}

export default App;



