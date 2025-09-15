import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import '../styles/CreatePlaylist.css';
import { createPlaylist} from '../services/playlistService';
import { toast } from 'react-toastify';

export default function CreatePlaylist() {
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistPermission, setNewPlaylistPermission] = useState('unlisted');

  const handleCreatePlaylist = async (e) => {
      e.preventDefault();
      const payload = {
          playlist_name: newPlaylistName,
          ...(newPlaylistPermission && { playlist_permission: newPlaylistPermission })
      };

      try {
          const res = await createPlaylist(payload);
          setNewPlaylistName(''); // Clear the input field after successful creation
          toast.success('Playlist created successfully!');
      } catch (error) {
        console.error(error.response.data.reason);
        toast.error(`Failed to create playlist. ${error.response.data.reason}`);
      }
  };


  return (
    <div className="dashboard-container">
      <Navbar />
      <div className="new-playlist-container">
        <div className="form-card new-playlist-form">
          <h2 className="section-title">Create New Playlist</h2>
          <form onSubmit={handleCreatePlaylist} className="create-playlist-form ">
            <label htmlFor="newPlaylistName" className="form-label">Playlist Name:</label>
            <input
                type="text"
                id="newPlaylistName"
                className="form-input"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="e.g., My Favorite Songs"
                required
            />
            <div className="permission-section">
              <label className="form-label">Playlist Privacy:</label>
              
              <div className="permission-toggle-group">
                <button
                  type="button"
                  className={`permission-toggle ${newPlaylistPermission === 'unlisted' ? 'active' : ''}`}
                  onClick={() => setNewPlaylistPermission('unlisted')}
                >
                  <span className="permission-icon">🔗</span>
                  <span>Unlisted</span>
                </button>

                <button
                  type="button"
                  className={`permission-toggle ${newPlaylistPermission === 'public' ? 'active' : ''}`}
                  onClick={() => setNewPlaylistPermission('public')}
                >
                  <span className="permission-icon">👥</span>
                  <span>Public</span>
                </button>

                <button
                  type="button"
                  className={`permission-toggle ${newPlaylistPermission === 'private' ? 'active' : ''}`}
                  onClick={() => setNewPlaylistPermission('private')}
                >
                  <span className="permission-icon">🔒</span>
                  <span>Private</span>
                </button>
              </div>
              
              <p className="permission-description">
                {newPlaylistPermission === 'unlisted' && (
                  <>🔗 Only people with the link can see this playlist</>
                )}
                {newPlaylistPermission === 'public' && (
                  <>👥 Everyone can see this playlist</>
                )}
                {newPlaylistPermission === 'private' && (
                  <>🔒 Only you can see this playlist</>
                )}
              </p>
            </div>
            <button type="submit" className="submit-btn">Create Playlist</button>
          </form>
        </div>
      </div>
    </div>
  );
};