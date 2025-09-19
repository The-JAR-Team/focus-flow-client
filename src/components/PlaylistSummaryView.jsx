import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { config } from '../config/config';
import '../styles/PlaylistSummaryView.css';
import Spinner from './Spinner';
import Navbar from './Navbar';

const PlaylistSummaryView = () => {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const [playlistData, setPlaylistData] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [language, setLanguage] = useState('English');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingSummaries, setLoadingSummaries] = useState({});
  
  // Redux selectors
  const { myPlaylists, otherPlaylists } = useSelector((state) => state.dashboard);
  
  // Refs for navigation
  const videoRefs = useRef({});

  useEffect(() => {
    fetchPlaylistData();
  }, [playlistId]);

  useEffect(() => {
    if (playlistData?.playlist_items) {
      fetchAllSummaries();
    }
  }, [playlistData, language]);

  const fetchPlaylistData = async () => {
    setLoading(true);
    try {
      // Try to find playlist in Redux store first
      const allPlaylists = [...(myPlaylists || []), ...(otherPlaylists || [])];
      const foundPlaylist = allPlaylists.find(p => p.playlist_id === parseInt(playlistId));
      
      if (foundPlaylist) {
        setPlaylistData(foundPlaylist);
      } else {
        // Fetch from API if not found in Redux store
        const { getPlaylistById } = await import('../services/playlistService');
        const fetchedPlaylist = await getPlaylistById(parseInt(playlistId));
        setPlaylistData(fetchedPlaylist);
      }
    } catch (err) {
      console.error('Error fetching playlist:', err);
      setError('Failed to load playlist data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSummaries = async () => {
    if (!playlistData?.playlist_items) return;

    const summaryPromises = playlistData.playlist_items.map(async (video) => {
      const videoId = video.video_id;
      const externalId = video.external_id;
      
      // Set loading state for this video
      setLoadingSummaries(prev => ({
        ...prev,
        [videoId]: true
      }));

      try {
        const response = await axios.get(
          `${config.baseURL}/videos/${externalId}/summary?lang=${language}`,
          { withCredentials: true }
        );

        if (response.data && response.data.status === 'success') {
          return {
            videoId,
            externalId,
            videoName: video.video_name,
            subject: video.subject,
            length: video.length,
            summary: response.data.video_summary
          };
        }
      } catch (err) {
        console.error(`Error fetching summary for video ${videoId}:`, err);
      } finally {
        setLoadingSummaries(prev => ({
          ...prev,
          [videoId]: false
        }));
      }
      
      return null;
    });

    const results = await Promise.all(summaryPromises);
    const summariesData = {};
    
    results.forEach(result => {
      if (result) {
        summariesData[result.videoId] = result;
      }
    });

    setSummaries(summariesData);
  };

  const scrollToVideo = (videoId) => {
    const element = videoRefs.current[videoId];
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      });
    }
  };

  const formatTime = (timeString) => {
    return timeString;
  };

  const generateVideoSummaryText = (videoData) => {
    let text = `${videoData.videoName}\n`;
    text += `Subject: ${videoData.subject} | Length: ${videoData.length}\n`;
    text += `${'='.repeat(50)}\n\n`;

    videoData.summary?.summary?.Subject?.forEach((subject, index) => {
      text += `${index + 1}. ${subject.subject_title}\n`;
      text += `Time: ${formatTime(subject.subject_start_time)} - ${formatTime(subject.subject_end_time)}\n\n`;
      
      text += `Overview: ${subject.subject_overall_summary}\n\n`;
      
      if (subject.description) {
        text += `Description: ${subject.description}\n\n`;
      }
      
      text += `Key Points:\n`;
      subject.sub_summaries?.forEach((subSummary) => {
        subSummary.properties?.forEach((prop) => {
          text += `• [${formatTime(prop.source_start_time)} - ${formatTime(prop.source_end_time)}] ${prop.summary_text}\n`;
        });
      });
      text += `\n`;
    });

    return text;
  };

  const generateFullPlaylistSummaryText = () => {
    let fullText = `${playlistData.playlist_name}\n`;
    fullText += `${'='.repeat(playlistData.playlist_name.length)}\n`;
    fullText += `Language: ${language}\n`;
    fullText += `Total Videos with Summaries: ${videosWithSummaries.length}\n\n`;

    videosWithSummaries.forEach((videoData, index) => {
      fullText += `\n${'#'.repeat(60)}\n`;
      fullText += `VIDEO ${index + 1}\n`;
      fullText += `${'#'.repeat(60)}\n\n`;
      fullText += generateVideoSummaryText(videoData);
    });

    return fullText;
  };

  if (loading) {
    return (
      <>
        <div style={{ padding: '20px' }}>
          <Navbar />
        </div>
        <div className="playlist-summary-container">
          <Spinner />
          <p className="loading-text">Loading playlist data...</p>
        </div>
      </>
    );
  }

  if (error || !playlistData) {
    return (
      <>
        <div style={{ padding: '20px' }}>
          <Navbar />
        </div>
        <div className="playlist-summary-container error">
          <h2>Error Loading Playlist</h2>
          <p>{error || 'Playlist not found'}</p>
          <button onClick={() => navigate(`/playlist/${playlistId}`)}>
            Back to Playlist
          </button>
        </div>
      </>
    );
  }

  const videosWithSummaries = Object.values(summaries);
  const totalVideos = playlistData.playlist_items?.length || 0;
  const loadedSummaries = videosWithSummaries.length;

  return (
    <>
      <div style={{ padding: '20px' }}>
        <Navbar />
      </div>
      <div className="playlist-summary-container" dir={language === 'Hebrew' ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="playlist-summary-header">
          <div className="header-left">
            <h1>Playlist Summary: {playlistData.playlist_name}</h1>
            <div className="navigation-links">
              <Link to={`/playlist/${playlistId}`} className="back-to-playlist">
                {language === 'Hebrew' ? 'חזרה לפלייליסט ←' : '← Back to Playlist'}
              </Link>
            </div>
          </div>
          
          <div className="language-selector">
            <div className="language-buttons">
              <button 
                className={`lang-btn ${language === 'English' ? 'active' : ''}`}
                onClick={() => setLanguage('English')}
              >
                English
              </button>
              <button 
                className={`lang-btn ${language === 'Hebrew' ? 'active' : ''}`}
                onClick={() => setLanguage('Hebrew')}
              >
                עברית
              </button>
            </div>
          </div>
        </div>

        {/* Table of Contents - Only show videos with summaries */}
        <div className="table-of-contents">
          <h2>Available Summaries ({language})</h2>
          <div className="toc-stats">
            <span>Total Videos: {totalVideos}</span>
            <span>Summaries Available: {loadedSummaries}</span>
            <span>Currently Loading: {Object.values(loadingSummaries).filter(loading => loading).length}</span>
          </div>
          
          {videosWithSummaries.length > 0 && (
            <div className="toc-list">
              {videosWithSummaries.map((videoData, index) => (
                <div key={videoData.videoId} className="toc-item">
                  <div className="toc-number">{index + 1}</div>
                  <div className="toc-content">
                    <div className="toc-title" onClick={() => scrollToVideo(videoData.videoId)}>
                      {videoData.videoName}
                    </div>
                    <div className="toc-meta">
                      <span className="toc-subject">{videoData.subject}</span>
                      <span className="toc-length">{videoData.length}</span>
                      <span className="toc-has-summary">✓ Ready to copy</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {videosWithSummaries.length === 0 && Object.values(loadingSummaries).some(loading => loading) && (
            <div className="toc-loading">
              <p>Loading summaries for {language}...</p>
            </div>
          )}

          {videosWithSummaries.length === 0 && !Object.values(loadingSummaries).some(loading => loading) && (
            <div className="toc-no-summaries">
              <p>No summaries available in {language}. Try switching languages or check back later.</p>
            </div>
          )}
        </div>

        {/* Video Summaries - Clean Copy-Paste Format */}
        <div className="video-summaries">
          {/* Copy All Button */}
          <div className="copy-all-section">
            <button 
              className="copy-all-button"
              onClick={() => {
                const allText = generateFullPlaylistSummaryText();
                navigator.clipboard.writeText(allText);
                // Show toast or feedback
              }}
            >
              📋 Copy All Summaries
            </button>
          </div>

          {/* Display only videos that have summaries */}
          {videosWithSummaries.map((videoData, index) => (
            <div 
              key={videoData.videoId} 
              className="video-summary-section"
              ref={el => videoRefs.current[videoData.videoId] = el}
            >
              {/* Video Header - Simple and Clean */}
              <div className="video-header">
                <h2>
                  {index + 1}. {videoData.videoName}
                </h2>
                <div className="video-meta-simple">
                  <span>Subject: {videoData.subject}</span>
                  <span>Length: {videoData.length}</span>
                  <button 
                    className="copy-video-button"
                    onClick={() => {
                      const videoText = generateVideoSummaryText(videoData);
                      navigator.clipboard.writeText(videoText);
                    }}
                  >
                    📋 Copy
                  </button>
                </div>
              </div>

              {/* Summary Content - Clean Text Format */}
              <div className="summary-text-content">
                {videoData.summary?.summary?.Subject?.map((subject, subjectIndex) => (
                  <div key={subjectIndex} className="subject-text-block">
                    <h3>{subject.subject_title}</h3>
                    <p className="time-info">({formatTime(subject.subject_start_time)} - {formatTime(subject.subject_end_time)})</p>
                    
                    <div className="summary-overview">
                      <p><strong>Overview:</strong> {subject.subject_overall_summary}</p>
                    </div>

                    {subject.description && (
                      <div className="subject-description">
                        <p><strong>Description:</strong> {subject.description}</p>
                      </div>
                    )}

                    <div className="detailed-points">
                      <h4>Key Points:</h4>
                      {subject.sub_summaries?.map((subSummary, subIndex) => (
                        <div key={subIndex} className="points-group">
                          {subSummary.properties?.map((prop, propIndex) => (
                            <div key={propIndex} className="summary-point-simple">
                              <span className="time-marker">
                                [{formatTime(prop.source_start_time)} - {formatTime(prop.source_end_time)}]
                              </span>
                              <span className="point-text"> {prop.summary_text}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Show message if no summaries are available */}
          {videosWithSummaries.length === 0 && !Object.values(loadingSummaries).some(loading => loading) && (
            <div className="no-summaries-message">
              <h3>No summaries available in {language}</h3>
              <p>Summaries might be generating in the background. Please try again later or switch language.</p>
            </div>
          )}

          {/* Show loading message if still loading */}
          {Object.values(loadingSummaries).some(loading => loading) && (
            <div className="loading-summaries-message">
              <Spinner size="small" />
              <p>Loading summaries in {language}...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PlaylistSummaryView;
