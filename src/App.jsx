import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import AddVideo from './components/AddVideo';
import PlaylistView from './components/PlaylistView';
import VideoPlayerPage from './components/VideoPlayerPage';
import Trivia from './components/Trivia';
import TriviaVideoPage from './components/TriviaVideoPage';
import SummaryView from './components/SummaryView';
import CreatePlaylist from './components/CreatePlaylist';
import EngagementMonitor from './components/EngagementMonitor';
import MyAccount from './components/MyAccount';
import GroupsPage from './components/GroupsPage';
import OnnxModelPreloader from './components/OnnxModelPreloader';
import './styles/App.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <HashRouter>
      {/* Preload ONNX model when app starts */}
      <OnnxModelPreloader />
      
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/add-video" element={<PrivateRoute><AddVideo /></PrivateRoute>} />
        <Route path="/create-playlist" element={<PrivateRoute><CreatePlaylist /></PrivateRoute>} />
        <Route path="/playlist/:playlistId" element={<PrivateRoute><PlaylistView /></PrivateRoute>} />
        <Route path="/playlist/:playlistId/video/:videoId" element={<PrivateRoute><VideoPlayerPage /></PrivateRoute>} />
        <Route path="/trivia" element={<PrivateRoute><Trivia /></PrivateRoute>} />        
        <Route path="/trivia/:videoId" element={<PrivateRoute><TriviaVideoPage /></PrivateRoute>} />
        <Route path="/trivia/:videoId/summary" element={<PrivateRoute><SummaryView /></PrivateRoute>} />
        <Route path="/engagement-monitor" element={<PrivateRoute><EngagementMonitor /></PrivateRoute>} />
        <Route path="/my-account" element={<PrivateRoute><MyAccount /></PrivateRoute>} />
        <Route path="/groups" element={<PrivateRoute><GroupsPage /></PrivateRoute>} />
      </Routes>
      <ToastContainer position="bottom-right" autoClose={3000} />
    </HashRouter>
  );
}

export default App;