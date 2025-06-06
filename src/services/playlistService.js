import axios from 'axios';
import { config } from '../config/config';
import { fetchVideoMetadata } from './videos';

// Expected create playlist body:
// {
//   "playlist_name": "My Favorite Songs",
//   "playlist_permission": "unlisted" // optional
// }
export async function createPlaylist(playlistData) {
    try {
        const response = await axios.post(`${config.baseURL}/playlists`, playlistData, {
            headers: { 'Content-Type': 'application/json' },
            withCredentials: true
        });
        return response.data;
    } catch (error) {
        throw error;
    }
}

// Remove video from playlist
export async function removeVideoFromPlaylist(videoData) {
    try {
        const response = await axios.post(`${config.baseURL}/videos/remove_from_playlist`, videoData, {
            headers: { 'Content-Type': 'application/json' },
            withCredentials: true
        });
        return response.data;
    } catch (error) {
        console.error('Failed to remove video from playlist:', error);
        throw error;
    }
}

// Fetch user's playlist by ID
export async function getPlaylistById(playlistId) {
    try{
        // First try to get the playlist from the existing data
        const data = await fetchVideoMetadata();
        const playlist = data.playlists.find(p => p.playlist_id === parseInt(playlistId));
        
        if (playlist) {
            console.log('Playlist found in metadata:', playlist);
            return playlist;
        }
        
        // If not found in metadata, try to fetch directly (for direct URL access)
        console.log('Playlist not found in metadata, fetching directly');
        const response = await axios.get(`${config.baseURL}/playlists/${playlistId}`, {
            withCredentials: true
        });
        
        if (response.data && response.data.playlist) {
            return response.data.playlist;
        }
        
        throw new Error('Playlist not found');
    } catch (error) {
        console.error('Error fetching playlist:', error);
        throw error;
    }
};

// Update Playlist Permission
export async function updatePlaylistPermission(playlistId, permission) {
    try {
        const response = await axios.put(`${config.baseURL}/playlists/${playlistId}/permission`, {
            "new_permission": permission
        } , {
            headers: { 'Content-Type': 'application/json' },
            withCredentials: true
        });
        return response.data;
    } catch (error) {
        console.error('Failed to update playlist\'s permission:', error.response.data.reason);
        throw error;
    }
}

export async function updatePlaylistName(old_name, new_name) {
    try {
        const response = await axios.put(`${config.baseURL}/playlists/update_name`, ({
            "old_name": old_name,
            "new_name": new_name
        }), {
            headers: { 'Content-Type': 'application/json' },
            withCredentials: true
        });
        return response.data;
    } catch (error) {
        // const errorMessage = 'Failed to update playlist\'s name: ' + error.response.data.reason;
        const errorMessage =  error.response.data.reason;
        throw new Error(errorMessage);
    }
}