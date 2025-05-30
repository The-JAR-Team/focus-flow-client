import React, { useState, useEffect, useRef } from 'react';
import '../styles/Trivia.css';
import QuizMode from './QuizMode';
import Navbar from './Navbar';  // Add this import
import { useNavigate } from 'react-router-dom';
import { fetchUserInfo } from '../services/api';
import { getVideoOwnership } from '../utils/videoUtils';
import { fetchTriviaData, filterVideos, extractPlaylists } from '../services/triviaService';
import Spinner from './Spinner';

function Trivia() {  const [videos, setVideos] = useState([]);
  const [filteredVideos, setFilteredVideos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOwner, setFilterOwner] = useState(() => {
    // Load saved owner filter from localStorage, default to 'all'
    return localStorage.getItem('triviaFilterOwner') || 'all';
  });
  const [filterSubject, setFilterSubject] = useState(() => {
    // Load saved subject filter from localStorage, default to 'all'
    return localStorage.getItem('triviaFilterSubject') || 'all';
  });
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [userInfo, setUserInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [videoOwnership, setVideoOwnership] = useState(null);
  const [lastViewedVideoId, setLastViewedVideoId] = useState(null);
  const [disableScrolling, setDisableScrolling] = useState(false); // Added to control scrolling behaviorconst [playlists, setPlaylists] = useState([]);
  const [playlistSearchTerm, setPlaylistSearchTerm] = useState('');
  const [filterPlaylist, setFilterPlaylist] = useState(() => {
    // Load saved playlist filter from localStorage, default to 'all'
    return localStorage.getItem('triviaFilterPlaylist') || 'all';
  });
  const [showPlaylistSuggestions, setShowPlaylistSuggestions] = useState(false);
  const [playlistSuggestions, setPlaylistSuggestions] = useState([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const playlistInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const videoRefs = useRef({});
  const navigate = useNavigate();  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        // Load both video metadata and user info in parallel
        const [triviaData, userInfoResponse] = await Promise.all([
          fetchTriviaData(),
          fetchUserInfo()
        ]);

        // Handle video data
        const ownership = getVideoOwnership(triviaData);
        setVideoOwnership(ownership);
        
        const videosArray = [...ownership.ownedVideos, ...ownership.otherVideos];
        localStorage.setItem('triviaVideos', JSON.stringify(videosArray));
        setVideos(videosArray);
        
        // Extract and set subjects
        const uniqueSubjects = [...new Set(videosArray.map(video => video.subject))];
        setSubjects(uniqueSubjects);        // Extract playlists from the response data
        const extractedPlaylists = extractPlaylists(triviaData);
        console.log('Extracted playlists:', extractedPlaylists);
        
        if (extractedPlaylists.length === 0) {
          console.warn('No playlists were extracted. Showing an error message might be appropriate.');
          // You could set some state to show a warning to the user
        }
        
        setPlaylists(extractedPlaylists);

        // Handle user info
        console.log('User info loaded:', userInfoResponse);
        setUserInfo(userInfoResponse);

        // Check if there's a saved subject filter that needs to be validated
        const savedSubjectFilter = localStorage.getItem('triviaFilterSubject');
        if (savedSubjectFilter && savedSubjectFilter !== 'all' && !uniqueSubjects.includes(savedSubjectFilter)) {
          // If the saved subject filter is no longer valid, reset it to 'all'
          setFilterSubject('all');
          localStorage.setItem('triviaFilterSubject', 'all');
        }

        // Set initial filtered videos after both data are loaded
        const initialFiltered = videosArray.filter(video => {
          console.log("video?.upload_by == fullName", video?.upload_by);

          // Apply owner filter
          if (filterOwner !== 'all') {
            const fullName = `${userInfoResponse['first name']} ${userInfoResponse['last name']}`;
            const isOwnedByUser = video?.upload_by === fullName;
            if (filterOwner === 'me' && !isOwnedByUser) return false;
            if (filterOwner === 'others' && isOwnedByUser) return false;
          }

          // Apply subject filter
          if (filterSubject !== 'all' && video?.subject !== filterSubject) {
            return false;
          }

          return true;
        });
        setFilteredVideos(initialFiltered);        // Check if we have a last viewed video ID in localStorage
        const lastViewedId = localStorage.getItem('lastViewedVideoId');
        if (lastViewedId) {
          setLastViewedVideoId(lastViewedId);
          // Clear it from localStorage after retrieving it
          localStorage.removeItem('lastViewedVideoId');
        }
        
        // If we have a saved playlist filter, update the search term
        const savedPlaylistFilter = localStorage.getItem('triviaFilterPlaylist');
        if (savedPlaylistFilter && savedPlaylistFilter !== 'all') {
          setPlaylistSearchTerm(savedPlaylistFilter);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []); // Empty dependency array as this should only run once  // Modify the filter effect to only run when we have both videos and user info
  useEffect(() => {
    if (!videos.length || !videoOwnership) return; // Don't run if we don't have both

    const filteredResult = filterVideos(videos, {
      searchTerm,
      filterOwner,
      filterSubject,
      filterPlaylist,
      userInfo,
      videoOwnership,
      playlists
    });

    setFilteredVideos(filteredResult);
  }, [searchTerm, filterOwner, filterSubject, filterPlaylist, videos, videoOwnership, userInfo, playlists]);// Effect to scroll to the last viewed video when the component is fully rendered
  useEffect(() => {
    if (lastViewedVideoId && !isLoading && filteredVideos.length > 0) {
      // Only scroll if we have a valid video ID and the component is fully loaded
      const videoRef = videoRefs.current[lastViewedVideoId];
      if (videoRef) {
        // Use a timeout to ensure we're not interrupting any other UI operations
        setTimeout(() => {
          // Double check that lastViewedVideoId is still valid (not reset by filter changes)
          if (lastViewedVideoId) {
            // Scroll the video card into view with a smooth animation
            videoRef.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
            
            // Highlight the video card temporarily
            videoRef.classList.add('highlight-video');
            setTimeout(() => {
              videoRef.classList.remove('highlight-video');
            }, 2000);
          }
        }, 100);
      }
    }
  }, [lastViewedVideoId, isLoading, filteredVideos]);
    // Effect to update playlist suggestions based on search term
  useEffect(() => {
    if (playlistSearchTerm.trim() === '') {
      setPlaylistSuggestions([]);
      return;
    }
    
    console.log('Searching playlists:', playlistSearchTerm);
    console.log('Available playlists:', playlists);
    
    const filtered = playlists.filter(playlist => 
      playlist.playlist_name.toLowerCase().includes(playlistSearchTerm.toLowerCase())
    );
    
    console.log('Filtered playlists:', filtered);
    setPlaylistSuggestions(filtered);
  }, [playlistSearchTerm, playlists]);

  // Handle clicks outside the playlist suggestions to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target) &&
        playlistInputRef.current && 
        !playlistInputRef.current.contains(event.target)
      ) {
        setShowPlaylistSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  // Handle keyboard navigation in playlist suggestions
  const handlePlaylistKeyDown = (e) => {
    if (!showPlaylistSuggestions) return;
    
    // ArrowDown key
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => 
        prev < playlistSuggestions.length - 1 ? prev + 1 : prev
      );
    }
    // ArrowUp key
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev > 0 ? prev - 1 : 0));
    }
    // Enter key
    else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
      e.preventDefault();
      const selectedPlaylist = playlistSuggestions[activeSuggestionIndex];
      if (selectedPlaylist) {
        setFilterPlaylist(selectedPlaylist.playlist_name);
        setPlaylistSearchTerm(selectedPlaylist.playlist_name);
        setShowPlaylistSuggestions(false);
        localStorage.setItem('triviaFilterPlaylist', selectedPlaylist.playlist_name);
        // Reset lastViewedVideoId to prevent scrolling
        setLastViewedVideoId(null);
      }
    }
    // Escape key
    else if (e.key === 'Escape') {
      e.preventDefault();
      setShowPlaylistSuggestions(false);
    }
  };
      setShowPlaylistSuggestions(false);
    }
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterOwner('all');
    setFilterSubject('all');
    setFilterPlaylist('all');
    setPlaylistSearchTerm('');
    setLastViewedVideoId(null); // Clear the last viewed video ID to prevent scrolling
    localStorage.setItem('triviaFilterOwner', 'all');
    localStorage.setItem('triviaFilterSubject', 'all');
    localStorage.setItem('triviaFilterPlaylist', 'all');
    localStorage.removeItem('lastViewedVideoId'); // Also remove from localStorage to be thorough
  };

  const handleVideoSelect = (video) => {
    // Store the selected video in localStorage before navigating
    const storedVideos = JSON.parse(localStorage.getItem('triviaVideos') || '[]');
    if (!storedVideos.some(v => v.video_id === video.video_id)) {
      storedVideos.push(video);
      localStorage.setItem('triviaVideos', JSON.stringify(storedVideos));
    }
    navigate(`/trivia/${video.video_id}`);
  };

  if (isLoading) {
    return (
      <div style={{ padding: '20px' }}>
        <Navbar />
        <div className="trivia-container">
          <div className="loading-container">
            <Spinner size="large" message="Loading videos and questions..." />
          </div>
        </div>
      </div>
    );
  }

  if (selectedVideo) {
    return <QuizMode video={selectedVideo} onBack={() => setSelectedVideo(null)} />;
  }

  return (
    <div style={{ padding: '20px' }}>
      <Navbar />
      <div className="trivia-container">          <div className="filters">          <input
            type="text"
            placeholder="Search by title..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              // Reset lastViewedVideoId to prevent scrolling
              setLastViewedVideoId(null);
            }}
            className="search-input"
          /><select 
            value={filterOwner} 
            onChange={(e) => {
              const newValue = e.target.value;
              setFilterOwner(newValue);
              // Save the selection to localStorage
              localStorage.setItem('triviaFilterOwner', newValue);
              // Reset lastViewedVideoId to prevent scrolling
              setLastViewedVideoId(null);
            }}
            className="filter-select"
          >
            <option value="all">All Videos</option>
            <option value="me">My Videos</option>
            <option value="others">Other's Videos</option>
          </select>          <select 
            value={filterSubject} 
            onChange={(e) => {
              const newValue = e.target.value;
              setFilterSubject(newValue);
              // Save the selection to localStorage
              localStorage.setItem('triviaFilterSubject', newValue);
              // Reset lastViewedVideoId to prevent scrolling
              setLastViewedVideoId(null);
            }}
            className="filter-select"
          >
            <option value="all">All Subjects</option>
            {subjects.map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
          
          {/* Only show the Clear Filters button when some filter is active */}
          {(searchTerm || filterOwner !== 'all' || filterSubject !== 'all' || filterPlaylist !== 'all') && (
            <button 
              className="clear-filters-btn"
              onClick={handleClearFilters}
            >
              Clear Filters
            </button>
          )}
          
          {/* Playlist filter moved below other filters */}
          <div className="playlist-search-container">
            <input
              type="text"
              placeholder="Search by Playlists"
              value={playlistSearchTerm}
              onChange={(e) => {                setPlaylistSearchTerm(e.target.value);
                setActiveSuggestionIndex(-1);
                setShowPlaylistSuggestions(true);
                
                // Reset lastViewedVideoId to prevent scrolling
                setLastViewedVideoId(null);
                
                // If clearing the field, also reset the filter
                if (e.target.value === '') {
                  setFilterPlaylist('all');
                  localStorage.setItem('triviaFilterPlaylist', 'all');
                }
              }}
              onFocus={() => setShowPlaylistSuggestions(true)}
              onKeyDown={handlePlaylistKeyDown}
              className={`search-input playlist-search ${filterPlaylist !== 'all' ? 'active-filter' : ''}`}
              ref={playlistInputRef}
            />            {filterPlaylist !== 'all' && (              <span 
                className="playlist-filter-indicator" 
                title="Clear playlist filter"
                onClick={(e) => {
                  e.preventDefault(); // Prevent default behavior
                  e.stopPropagation(); // Prevent event propagation
                  // Reset the filter but don't modify lastViewedVideoId
                  setFilterPlaylist('all');
                  setPlaylistSearchTerm('');
                  setLastViewedVideoId(null); // Reset lastViewedVideoId to prevent scrolling
                  localStorage.setItem('triviaFilterPlaylist', 'all');
                  // Close suggestions dropdown if open
                  setShowPlaylistSuggestions(false);
                }}
              >
                ג
              </span>
            )}
            {playlistSearchTerm && filterPlaylist === 'all' && (
              <span 
                className="playlist-filter-indicator" 
                title="Search playlists"
              >
                נ”
              </span>
            )}
              {showPlaylistSuggestions && (
              <div className="playlist-suggestions" ref={suggestionsRef}>
                {playlistSuggestions.length > 0 ? (
                  playlistSuggestions.map((playlist, index) => (
                    <div 
                      key={playlist.playlist_id} 
                      className={`playlist-suggestion-item ${index === activeSuggestionIndex ? 'active' : ''}`}                      onClick={() => {
                        setFilterPlaylist(playlist.playlist_name);
                        setPlaylistSearchTerm(playlist.playlist_name);
                        setShowPlaylistSuggestions(false);
                        localStorage.setItem('triviaFilterPlaylist', playlist.playlist_name);
                        // Reset lastViewedVideoId to prevent scrolling
                        setLastViewedVideoId(null);
                      }}
                    >
                      {playlist.playlist_name}
                    </div>
                  ))
                ) : (
                  <div className="playlist-suggestion-item no-results">
                    {playlistSearchTerm.trim() !== '' ? 'No matching playlists found' : 'Type to search playlists'}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Only show the Clear Filters button when some filter is active */}
          {(searchTerm || filterOwner !== 'all' || filterSubject !== 'all' || filterPlaylist !== 'all') && (
            <button 
              className="clear-filters-btn"
              onClick={handleClearFilters}
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="videos-grid">
          {filteredVideos.map(video => (
            <div 
              key={video?.video_id || Math.random()} 
              className={`video-card ${lastViewedVideoId === video.video_id ? 'last-viewed' : ''}`}
              ref={el => videoRefs.current[video.video_id] = el}
            >
              <img 
                src={video?.external_id ? `https://img.youtube.com/vi/${video.external_id}/hqdefault.jpg` : ''} 
                alt={video?.video_name || 'Untitled'} 
                onClick={() => handleVideoSelect(video)}
              />
              <div className="video-info">
                <h3>{video?.video_name || 'Untitled'}</h3>
                <p>Subject: {video?.subject || 'Unknown'}</p>
                <p>By: {video?.upload_by || 'Unknown'}</p>
                
                <div className="video-actions">
                  <button 
                    className="quiz-btn"
                    onClick={() => handleVideoSelect(video)}
                  >
                    <span role="img" aria-label="quiz">ג“</span> Quiz
                  </button>
                  <button 
                    className="summary-btn"
                    onClick={() => navigate(`/trivia/${video.video_id}/summary`)}
                  >
                    <span role="img" aria-label="summary">נ“</span> Summary
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Trivia;
