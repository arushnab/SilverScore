import React from 'react';

import './searchBar.css'
const SearchBar= (props) => {

return( <div className='search-container'> 

<input 
className= 'search-bar'
 value={props.value} 
 onChange={(event)=>props.setSearchResult(event.target.value) }
 placeholder = 'Search for a movie...' >

 </input>

</div>

);
    
  };

  export default SearchBar;
