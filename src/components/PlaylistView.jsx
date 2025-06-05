import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import Navbar from './Navbar';
import { getSubscriberCount } from '../services/subscriptionService';
import SubscribeModal from './SubscribeModal';
import UnsubscribeModal from './UnsubscribeModal';
import { removeVideoFromPlaylist, updatePlaylistName, updatePlaylistPermission } from '../services/playlistService';
import { removeVideo, updatePlaylistData } from '../redux/dashboardSlice';
import { setSelectedPlaylist, clearPlaylist, removeVideoFromSelectedPlaylist, editSelectedPlaylistName, editSelectedPlaylistPermission } from '../redux/playlistSlice';
import { toast } from 'react-toastify';
import '../styles/PlaylistView.css';

function PlaylistView() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { playlistId } = useParams();
  
  // All state hooks at the top level
  const [mode, setMode] = useState(() => localStorage.getItem('mode') || 'pause');
  const [subscriberCount, setSubscriberCount] = useState(null);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [showUnsubscribeModal, setShowUnsubscribeModal] = useState(false);
  const [playlistData, setPlaylistData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPermission, setIsEditingPermission] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedPermission, setEditedPermission] = useState('private');
  
  // Redux selectors
  const { currentUser } = useSelector((state) => state.user);
  const { playlist } = useSelector(state => state.playlist);
  const { myPlaylists, otherPlaylists } = useSelector((state) => state.dashboard);
  
  // Compute derived state
  const isOwner = playlistData?.playlist_owner_id === currentUser?.user_id;
  
  // Save the mode to localStorage
  useEffect(() => {
    localStorage.setItem('mode', mode);
  }, [mode]);

  // Update edited fields when playlistData changes
  useEffect(() => {
    if (playlistData) {
      setEditedName(playlistData.playlist_name);
      setEditedPermission(playlistData.playlist_permission);
    }
  }, [playlistData]);

  // Fetch subscriber count when playlistData is available
  useEffect(() => {
    const fetchSubscriberCount = async () => {
      if (playlistData && playlistData.playlist_id) {
        try {
          const count = await getSubscriberCount(playlistData.playlist_id);
          setSubscriberCount(count);
        } catch (error) {
          console.error(error);
          console.log('Not authorized to view subscriber count');
          setSubscriberCount(null);
        }
      }
    };
    
    fetchSubscriberCount();
  }, [playlistData?.playlist_id]);

  // Fetch playlist if not in Redux store
  useEffect(() => {
    const fetchPlaylistIfNeeded = async () => {
      if (playlist && playlist.playlist_id === parseInt(playlistId)) {
        // Use the playlist from Redux store
        setPlaylistData(playlist);
        setIsLoading(false);
        return;
      }

      // Try to find playlist in dashboard data
      const allPlaylists = [...(myPlaylists || []), ...(otherPlaylists || [])];
      const foundPlaylist = allPlaylists.find(p => p.playlist_id === parseInt(playlistId));
      
      if (foundPlaylist) {
        dispatch(setSelectedPlaylist(foundPlaylist));
        setPlaylistData(foundPlaylist);
        setIsLoading(false);
        return;
      }

      // Fetch from API if not found in Redux store
      try {
        setIsLoading(true);
        const { getPlaylistById } = await import('../services/playlistService');
        const fetchedPlaylist = await getPlaylistById(parseInt(playlistId));
        
        if (fetchedPlaylist) {
          dispatch(setSelectedPlaylist(fetchedPlaylist));
          setPlaylistData(fetchedPlaylist);
        } else {
          toast.error('Playlist not found');
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Error fetching playlist:', error);
        toast.error('Failed to load playlist');
        navigate('/dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlaylistIfNeeded();  }, [playlistId, playlist, myPlaylists, otherPlaylists, dispatch, navigate]);

  // Handler functions
  const handleDeleteVideo = async (video) => {
    if (window.confirm(`Are you sure you want to remove "${video.video_name}" from this playlist?`)) {
      try {
        await removeVideoFromPlaylist(video);
        dispatch(removeVideo({
          playlist_name: playlistData.playlist_name,
          playlist_item_id: video.playlist_item_id
        }));

        if (playlistData.playlist_items.length === 1) {
          navigate('/dashboard'); // Redirect to dashboard if no videos left
          dispatch(clearPlaylist());
        }
        else {
          dispatch(removeVideoFromSelectedPlaylist({ playlist_item_id: video.playlist_item_id }));
          
          // Update local state
          setPlaylistData(prev => ({
            ...prev,
            playlist_items: prev.playlist_items.filter(item => item.playlist_item_id !== video.playlist_item_id)
          }));
        }
        toast.success('Video removed successfully!');
      } catch (error) {
        console.error('Failed to remove video:', error);
        toast.error(`Failed to remove video. ${error}.`); 
      }
    }
  };

  const savePlaylistName = async () => {
    try {
      await updatePlaylistName(playlistData.playlist_name, editedName);

      dispatch(editSelectedPlaylistName(editedName));

      dispatch(updatePlaylistData({
        playlist_name: playlistData.playlist_name,
        name: editedName, 
        permission: null
      }));

      // Update local state
      setPlaylistData(prev => ({
        ...prev,
        playlist_name: editedName
      }));

      // Exit edit mode
      setIsEditingName(false);

      toast.success('Playlist updated successfully!');
    } catch (error) {
      const errorMessage = error.message;
      toast.error(errorMessage);
      console.error(errorMessage);
    }
  };

  const savePlaylistPermission = async () => {
    try {
      await updatePlaylistPermission(playlistData.playlist_id, editedPermission);

      dispatch(editSelectedPlaylistPermission(editedPermission));

      dispatch(updatePlaylistData({
        playlist_name: playlistData.playlist_name,
        name: null,
        permission: editedPermission
      }));

      // Update local state
      setPlaylistData(prev => ({
        ...prev,
        playlist_permission: editedPermission
      }));

      // Exit edit mode
      setIsEditingPermission(false);

      toast.success('Playlist permission updated successfully!');
    } catch (error) {
      const errorMessage = error.message;
      toast.error(errorMessage);
      console.error(errorMessage);
    }
  };

  // Conditional rendering
  if (isLoading) {
    return (
      <div className="dashboard-container">
        <Navbar />
        <div className="dashboard-content">
          <div className="loading-message">Loading playlist...</div>
        </div>
      </div>
    );
  }

  if (!playlistData) {
    return (
      <div className="dashboard-container">
        <Navbar />
        <div className="dashboard-content">
          <div className="not-found-message">Playlist not found</div>
          <button className="back-button" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <Navbar />
      <div className="dashboard-content">
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
        
        {/* Playlist name with inline editing */}
        <div className="playlist-title-container">
          {isEditingName ? (
            <div className="inline-edit-form">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                autoFocus
                className="playlist-name-input"
                maxLength={50}
              />
              <div className="edit-actions">
                <button 
                  onClick={savePlaylistName}
                  disabled={!editedName.trim() || editedName === playlistData.playlist_name}
                  className="save-btn"
                >
                  Save
                </button>
                <button 
                  onClick={() => {
                    setEditedName(playlistData.playlist_name); // Reset to original
                    setIsEditingName(false);
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="playlist-title-display">
              <h2>{playlistData.playlist_name}</h2>
              {isOwner && (
                <button
                  className="edit-icon"
                  onClick={() => setIsEditingName(true)}
                  title="Edit playlist name"
                >
                  ✏️
                </button>
              )}
            </div>
          )}
        </div>

        <div className="playlist-header">
          <div className="permission-container"> 
            {isEditingPermission ? (
              <div className="permission-toggles-container"> 
                <div className="permission-toggles-group">
                  <button
                    className={`permission-toggles ${editedPermission === 'unlisted' ? 'active' : ''}`}
                    onClick={() => setEditedPermission('unlisted')}
                  >
                    <span className="permission-icon">🔗</span>
                    <span>Unlisted</span>
                  </button>

                  <button
                    className={`permission-toggles ${editedPermission === 'public' ? 'active' : ''}`}
                    onClick={() => setEditedPermission('public')}
                  >
                    <span className="permission-icon">👥</span>
                    <span>Public</span>
                  </button>

                  <button
                    className={`permission-toggles ${editedPermission === 'private' ? 'active' : ''}`}
                    onClick={() => setEditedPermission('private')}
                  >
                    <span className="permission-icon">🔒</span>
                    <span>Private</span>
                  </button>
                </div>
                <div className="permission-edit-actions">
                  <button
                    onClick={savePlaylistPermission}
                    disabled={editedPermission === playlistData.playlist_permission}
                    className="save-btn"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditedPermission(playlistData.playlist_permission);
                      setIsEditingPermission(false);
                    }}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
                <div className="inline-edit-form"> 
                <p>Permission: {playlistData.playlist_permission}</p>
                {isOwner && (
                  <button
                    className="edit-icon"
                    onClick={() => setIsEditingPermission(true)}
                    title="Edit playlist permission"
                  >
                    ✏️
                  </button>
                )}
              </div>
            )}
          </div>

          <p>Owner: {playlistData.playlist_owner_name}</p>
          {subscriberCount !== null && (
            <>
              <p>Subscribers: {subscriberCount}</p>
              <button className="subscribe-button" onClick={() => setShowSubscribeModal(true)}>
                Add Subscriber
              </button>
              |
              <button className="unsubscribe-button" onClick={() => setShowUnsubscribeModal(true)}>
                Remove Subscription
              </button>
            </>
          )}
        </div>
        <div className="content-grid-playlist">
          {playlistData.playlist_items && playlistData.playlist_items.map(video => (
            <div 
              className="video-card" 
              key={video.video_id || video.external_id}
              onClick={() => navigate(`/playlist/${playlistId}/video/${video.external_id}`)}
            >
              <h4>{video.video_name}</h4>
              <div className="thumbnail-container">
                <img 
                  src={`https://img.youtube.com/vi/${video.external_id}/hqdefault.jpg`} 
                  alt={video.subject}
                />
                <div 
                  className="summary-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/trivia/${video.video_id}/summary`);
                  }}
                >
                  <span className="summary-icon">📝</span>
                  <span className="summary-text">View Summary</span>
                </div>
              </div>
              <div className="video-info">
                <h5>Subject: {video.subject}</h5>
                <small>Length: {video.length}</small>
              </div>
              {/* Delete button for playlist owner */}
              {isOwner && (
                <div className="video-delete-button" onClick={(e) => {
                    e.stopPropagation(); // Prevent opening the video
                    handleDeleteVideo(video);
                  }}
                >
                  🗑️
                </div>
              )}
            </div>
          ))}
        </div>
        {showSubscribeModal && (
          <SubscribeModal 
            playlistId={playlistData.playlist_id}
            onClose={() => setShowSubscribeModal(false)}
            onSubscribed={() => {
              // Refresh subscriber count if authorized
              getSubscriberCount(playlistData.playlist_id)
                .then(count => setSubscriberCount(count))
                .catch(err => setSubscriberCount(null));
            }}
          />
        )}
        {showUnsubscribeModal && (
          <UnsubscribeModal 
            playlistId={playlistData.playlist_id}
            onClose={() => setShowUnsubscribeModal(false)}
            onUnsubscribed={() => {
              getSubscriberCount(playlistData.playlist_id)
                .then(count => setSubscriberCount(count))
                .catch(err => setSubscriberCount(null));
            }}
          />
        )}
      </div>
    </div>
  );
}

export default PlaylistView;
