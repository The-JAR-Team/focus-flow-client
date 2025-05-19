import React, { useCallback, useEffect, useRef, useState } from 'react';
import YouTube from 'react-youtube';
import { Line } from 'react-chartjs-2';
import '../styles/VideoPlayer.css';
import '../styles/TriviaVideoPage.css'; // Add this import for button styles
import '../styles/QuestionTimeline.css'; // Import the CSS for QuestionTimeline

import {
  fetchLastWatchTime,
  resetTracking,
  updateLatestLandmark,
  handleVideoPause,
  handleVideoResume,
  setModelResultCallback,
  setBufferUpdateCallback,
  setFaceMeshErrorCallback,
  cancelAllRequests,
  REQUIRED_FRAMES,
} from '../services/videos';
import {
  setEngagementDetectionEnabled,
  getEngagementDetectionEnabled,
  setVideoPlaying,
  startManualTrigger,
  handleEngagementDetection,
  estimateGaze,
  canAskQuestion,
  markQuestionAsked,
  setGazeSensitivity
} from '../services/videoLogic';
import {
  fetchQuestionsWithRetry,
  handleResetAnsweredQuestions as serviceResetAnsweredQuestions,
  handlePlotResults as servicePlotResults,
  handleAllPlotResults as serviceAllPlotResults,
  handleLanguageChange as serviceHandleLanguageChange,
  parseTimeToSeconds,
  shuffleAnswers,
  getAvailableQuestions,
  selectNextQuestion
} from '../services/videoPlayerService';
import {
  formatTime
} from '../services/questionTimelineService';

import {
  Chart as ChartJS,
  LineElement, // Added
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { QuestionModal, DecisionModal } from './QuestionModals';
import useFaceMesh from '../hooks/useFaceMesh';
import QuestionTimeline from './QuestionTimeline'; // Import the new component

import EyeDebugger from './EyeDebugger';
ChartJS.register(LineElement,PointElement, CategoryScale, LinearScale, TimeScale, Title, Tooltip, Legend);

window.noStop = false;

function VideoPlayer({ lectureInfo, mode, onVideoPlayerReady }) {
  const webcamRef = useRef(null);
  const playerRef = useRef(null);
  const systemPauseRef = useRef(false);
  const lastGazeTime = useRef(Date.now());
  const lastQuestionAnsweredTime = useRef(0);

  const [disableEngagementLogic, setDisableEngagementLogic] = useState(false);
  const [debugTriggerActive, setDebugTriggerActive] = useState(false);

  const [initialPlaybackTime, setInitialPlaybackTime] = useState(0);
  const [sendIntervalSeconds, setSendIntervalSeconds] = useState(2);
  const [isPlaying, setIsPlaying] = useState(true);
  const [pauseStatus, setPauseStatus] = useState('Playing');
  const [userPaused, setUserPaused] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);

  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [resultsChartData, setResultsChartData] = useState({ labels: [], datasets: [] });
  const [showResultsChart, setShowResultsChart] = useState(false);

  const [resultsAllChartData, setAllResultsChartData] = useState({ labels: [], datasets: [] });
  const [showAllResultsChart, setAllShowResultsChart] = useState(false);

  const [loaded, setLoaded] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [answeredQIDs, setAnsweredQIDs] = useState(() => {
    const stored = localStorage.getItem(`answeredQuestions_${lectureInfo.videoId}`);
    return stored ? JSON.parse(stored) : [];
  });
  useEffect(() => {
    localStorage.setItem(`answeredQuestions_${lectureInfo.videoId}`, JSON.stringify(answeredQIDs));
  }, [answeredQIDs, lectureInfo.videoId]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [decisionPending, setDecisionPending] = useState(null);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });

  const [faceMeshStatus, setFaceMeshStatus] = useState('Initializing');
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [faceMeshEnabled, setFaceMeshEnabled] = useState(true);
  const [faceMeshError, setFaceMeshError] = useState(false);

  const handleFaceMeshRetry = () => {
    setShowRetryButton(false);
    setFaceMeshStatus('Initializing');
    setFaceMeshEnabled(false);
    setTimeout(() => {
      setFaceMeshEnabled(true);
    }, 1000);
  };

  const handleFaceMeshErrorState = useCallback((isError) => {
    setFaceMeshError(isError);
    if (isError) {
      setFaceMeshStatus('FaceMesh Error - Please refresh the page');
      setShowRetryButton(true);
    }
  }, []);

  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [hebrewQuestions, setHebrewQuestions] = useState([]);
  const [englishQuestions, setEnglishQuestions] = useState([]);
  const [isHebrewLoading, setIsHebrewLoading] = useState(true);
  const [isEnglishLoading, setIsEnglishLoading] = useState(true);
  
  const [hebrewStatus, setHebrewStatus] = useState(null);
  const [englishStatus, setEnglishStatus] = useState(null);
  const [retryCount, setRetryCount] = useState({ hebrew: 0, english: 0 });

  const [faceMeshReady, setFaceMeshReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // State for current video time
  const [playerHeight, setPlayerHeight] = useState(390); // Default player height
  const [showTimeline, setShowTimeline] = useState(true); // State for timeline visibility

  const [noClientPause, setNoClientPause] = useState(false);

  const immediateGaze = useRef('Looking center');
  const immediateGazeChangeTime = useRef(Date.now());
  const stableGaze = useRef('Looking center');
  const stableGazeChangeTime = useRef(Date.now());

  const SMOOTHING_MS = 300;
  const CENTER_THRESHOLD_MS = 100;
  const AWAY_THRESHOLD_MS = 400;

  const MODEL_THRESHOLD = -1.0;  const [lastModelResult, setLastModelResult] = useState(null);
  
  // Buffer tracking state
  const [bufferFrames, setBufferFrames] = useState(0);
  const [requestsSent, setRequestsSent] = useState(0);

  const [sensitivity, setSensitivity] = useState(7);
  const [currentGaze, setCurrentGaze] = useState(''); // track current gaze

  const [hebrewFetchInterval, setHebrewFetchInterval] = useState(null);
  const [englishFetchInterval, setEnglishFetchInterval] = useState(null);

  // Add AbortController refs
  const hebrewAbortController = useRef(new AbortController());
  const englishAbortController = useRef(new AbortController());

  useEffect(() => {
    setGazeSensitivity(sensitivity);
  }, [sensitivity]);
  useEffect(() => {
    console.log('🔄 Setting up video tracking');
    
    // Create new abort controllers when the component mounts
    hebrewAbortController.current = new AbortController();
    englishAbortController.current = new AbortController();

    // Set up buffer update callback
    setBufferUpdateCallback((bufferInfo) => {
      setBufferFrames(bufferInfo.currentFrames);
      setRequestsSent(bufferInfo.requestsSent);

      // Check for FaceMesh error flag from buffer update
      if (bufferInfo.hasError && !faceMeshError) {
        setFaceMeshError(true);
        setFaceMeshStatus('FaceMesh Error - Please refresh the page');
        setShowRetryButton(true);
      }
    });

    // Set up FaceMesh error callback
    setFaceMeshErrorCallback((isError) => {
      setFaceMeshError(isError);
      if (isError) {
        setFaceMeshStatus('FaceMesh Error - Please refresh the page');
        setShowRetryButton(true);
      }
    });
    
    return () => {
      console.log('🛑 Cleaning up ALL video resources');
      
      // Cancel all pending network requests
      try {
        hebrewAbortController.current.abort();
        englishAbortController.current.abort();
        cancelAllRequests(); // Cancel any other pending requests
      } catch (e) {
        console.error('Error during request cancellation:', e);
      }
      
      // Stop tracking and intervals
      resetTracking();
      handleVideoPause();
      setModelResultCallback(null);
      setBufferUpdateCallback(null);
      setFaceMeshErrorCallback(null);
      setVideoPlaying(false);
      
      // Clear question fetch intervals
      if (hebrewFetchInterval) {
        clearInterval(hebrewFetchInterval);
        setHebrewFetchInterval(null);
      }
      if (englishFetchInterval) {
        clearInterval(englishFetchInterval);
        setEnglishFetchInterval(null);
      }
      
      console.log('🧹 Video player cleanup complete');
    };
  }, [hebrewFetchInterval, englishFetchInterval]);

  useEffect(() => {
    let mounted = true;
    fetchLastWatchTime(lectureInfo.videoId).then((time) => {
      if (mounted) {
        setInitialPlaybackTime(time);
        console.log('⏩ Last watched time fetched:', time);
      }
    });
    return () => { mounted = false; };
  }, [lectureInfo.videoId]);

  const userPausedRef = useRef(userPaused);
  useEffect(() => {
    userPausedRef.current = userPaused;
  }, [userPaused]);

  const questionsRef = useRef(questions);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  const questionActiveRef = useRef(null);
  useEffect(() => {
    questionActiveRef.current = currentQuestion;
  }, [currentQuestion]);

  useEffect(() => {
    let intervalId = null;
    if (isPlaying && playerRef.current) {
      intervalId = setInterval(() => {
        const time = playerRef.current?.getCurrentTime() || 0;
        setCurrentTime(time);
      }, 1000); // Update every second
    } else {
      clearInterval(intervalId);
    }
    return () => clearInterval(intervalId); // Cleanup interval on unmount or when isPlaying changes
  }, [isPlaying]); // Rerun effect when isPlaying changes

  const handleNoClientPauseToggle = () => {
    // First stop all existing tracking
    resetTracking();
    
    // Then update the mode
    window.noStop = !noClientPause;
    setNoClientPause(prev => !prev);
    console.log(`🎮 No Client Pause ${!noClientPause ? 'Enabled' : 'Disabled'}`);
    
    // Finally restart tracking with clean state
    setTimeout(() => {
      if (playerRef.current) {
        handleVideoResume(
          lectureInfo.videoId,
          'basic',
          sendIntervalSeconds,
          () => playerRef.current?.getCurrentTime() || 0
        );
      }
    }, 500);
  };

  const handleEngagementLogicToggle = useCallback(() => {
    const newState = !disableEngagementLogic;
    setDisableEngagementLogic(newState);
    setEngagementDetectionEnabled(!newState);
  }, [disableEngagementLogic]);

  useEffect(() => {
    setTimeout(() => setLoaded(true), 1000);
    
    // Clear existing resources before creating new ones
    if (hebrewFetchInterval) clearInterval(hebrewFetchInterval);
    if (englishFetchInterval) clearInterval(englishFetchInterval);
    
    // Cancel any in-flight requests
    hebrewAbortController.current.abort();
    englishAbortController.current.abort();
    hebrewAbortController.current = new AbortController();
    englishAbortController.current = new AbortController();
    
    if (mode === 'question') {
      console.log("[DEBUG] Starting questions fetch for:", lectureInfo.videoId);
      
      // Initial fetch for Hebrew with abort signal
      fetchQuestionsWithRetry(
        lectureInfo.videoId,
        'Hebrew',
        setHebrewStatus,
        setIsHebrewLoading,
        setHebrewQuestions,
        selectedLanguage,
        questionsRef,
        setQuestions,
        hebrewAbortController.current
      ).then(result => {
        // Only setup interval if not cancelled and pending
        if (result.pending && !result.cancelled) {
          // Setup retry interval for Hebrew
          setRetryCount(prev => ({ ...prev, hebrew: 1 }));
          let attempt = 1;
          const intervalId = setInterval(() => {
            // Check if component is still mounted via abort signal
            if (hebrewAbortController.current.signal.aborted) {
              clearInterval(intervalId);
              return;
            }
            
            attempt++;
            setRetryCount(prev => ({ ...prev, hebrew: attempt }));
            setHebrewStatus(`Building questions... (${attempt})`);
            
            fetchQuestionsWithRetry(
              lectureInfo.videoId,
              'Hebrew',
              setHebrewStatus,
              setIsHebrewLoading,
              setHebrewQuestions,
              selectedLanguage,
              questionsRef,
              setQuestions,
              hebrewAbortController.current
            ).then(result => {
              if (result.success || !result.pending || result.cancelled) {
                clearInterval(intervalId);
                setHebrewFetchInterval(null);
              }
            }).catch(() => {
              clearInterval(intervalId);
              setHebrewFetchInterval(null);
            });
            
            // Stop after 15 attempts
            if (attempt >= 15) {
              clearInterval(intervalId);
              setHebrewFetchInterval(null);
              setHebrewStatus(`Timed out waiting for questions`);
            }
          }, 5000);
          
          setHebrewFetchInterval(intervalId);
        }
      }).catch(err => {
        console.error("Error in Hebrew question fetch:", err);
      });
      
      // Similar update for English with abort signal
      fetchQuestionsWithRetry(
        lectureInfo.videoId,
        'English',
        setEnglishStatus,
        setIsEnglishLoading,
        setEnglishQuestions,
        selectedLanguage,
        questionsRef,
        setQuestions,
        englishAbortController.current
      ).then(result => {
        if (result.pending && !result.cancelled) {
          // Setup retry interval for English
          setRetryCount(prev => ({ ...prev, english: 1 }));
          let attempt = 1;
          const intervalId = setInterval(() => {
            // Check if component is still mounted via abort signal
            if (englishAbortController.current.signal.aborted) {
              clearInterval(intervalId);
              return;
            }
            
            attempt++;
            setRetryCount(prev => ({ ...prev, english: attempt }));
            setEnglishStatus(`Building questions... (${attempt})`);
            
            fetchQuestionsWithRetry(
              lectureInfo.videoId,
              'English',
              setEnglishStatus,
              setIsEnglishLoading,
              setEnglishQuestions,
              selectedLanguage,
              questionsRef,
              setQuestions,
              englishAbortController.current
            ).then(result => {
              if (result.success || !result.pending || result.cancelled) {
                clearInterval(intervalId);
                setEnglishFetchInterval(null);
              }
            }).catch(() => {
              clearInterval(intervalId);
              setEnglishFetchInterval(null);
            });
            
            // Stop after 15 attempts
            if (attempt >= 15) {
              clearInterval(intervalId);
              setEnglishFetchInterval(null);
              setEnglishStatus(`Timed out waiting for questions`);
            }
          }, 5000);
          
          setEnglishFetchInterval(intervalId);
        }
      }).catch(err => {
        console.error("Error in English question fetch:", err);
      });
    }
    
    return () => {
      // Cancel ongoing operations when dependencies change
      hebrewAbortController.current.abort();
      englishAbortController.current.abort();
      
      if (hebrewFetchInterval) {
        clearInterval(hebrewFetchInterval);
        setHebrewFetchInterval(null);
      }
      if (englishFetchInterval) {
        clearInterval(englishFetchInterval);
        setEnglishFetchInterval(null);
      }
    };
  }, [lectureInfo.videoId, mode, selectedLanguage]);

  // Function to check and exit fullscreen if active
  const exitFullScreenIfActive = useCallback(() => {
    if (document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement ||
        document.msFullscreenElement) {
      console.log('🖥️ Exiting fullscreen mode for question');
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      return true;
    }
    return false;
  }, []);

  const handleLowEngagement = useCallback(() => {
    if (!isPlaying || currentQuestion || isHebrewLoading || isEnglishLoading) return;
    
    if (playerRef.current) {
      // Exit fullscreen if active before showing the question
      exitFullScreenIfActive();
      
      playerRef.current.pauseVideo();
      setIsPlaying(false);
      systemPauseRef.current = true;
    }

    if (mode === 'question' && canAskQuestion()) {
      const currentVideoTime = playerRef.current?.getCurrentTime() || 0;
      // Use fallback to Hebrew questions if English selection yields no questions
      let questionPool = questionsRef.current;
      if (selectedLanguage === 'English' && questionPool.length === 0 && hebrewQuestions.length > 0) {
        console.log('[DEBUGQ] English questions empty, falling back to Hebrew questions');
        questionPool = hebrewQuestions;
      }
      const availableQuestions = getAvailableQuestions(
        currentVideoTime,
        questionPool,
        answeredQIDs
      );
      
      console.log('debugg: availableQuestions:', availableQuestions);

      if (availableQuestions.length === 0) {
        console.log('debugg: no questions available for this segment');
        setCurrentQuestion({ text: '', answers: [] });
        return;
      }

      const nextQuestion = selectNextQuestion(availableQuestions);
      console.log('debugg: nextQuestion to ask:', nextQuestion);
      if (nextQuestion) {
        markQuestionAsked();
        setCurrentQuestion({
          q_id: nextQuestion.q_id,
          text: nextQuestion.question,
          answers: shuffleAnswers(nextQuestion, selectedLanguage),
          originalTime: parseTimeToSeconds(nextQuestion.question_origin),
          endTime: parseTimeToSeconds(nextQuestion.question_explanation_end)
        });
      }
    }
  }, [
    isPlaying, currentQuestion, mode, selectedLanguage,
    answeredQIDs, isHebrewLoading, isEnglishLoading, exitFullScreenIfActive
  ]);

  const handleVideoPlayback = useCallback((newGaze) => {
    // Log every gaze event
    //console.log('[DEBUGQ] handleVideoPlayback incoming gaze:', newGaze);
    
    // Skip only if engagement detection is disabled
    if (!getEngagementDetectionEnabled()) return;

    // Proceed with engagement detection
    handleEngagementDetection({
      newGaze,
      immediateGaze,
      immediateGazeChangeTime,
      stableGaze,
      stableGazeChangeTime,
      isPlaying,
      currentQuestion,
      playerRef,
      mode,
      questionActiveRef,
      userPausedRef,
      SMOOTHING_MS,
      CENTER_THRESHOLD_MS,
      AWAY_THRESHOLD_MS,
      handleLowEngagement,
      setIsPlaying,
      setPauseStatus,
      setUserPaused
    });
  }, [isPlaying, currentQuestion, mode, handleLowEngagement]);

  const handleFaceMeshResults = useCallback((results) => {
    // First update the latest landmark regardless of errors
    updateLatestLandmark(results);
    
    // Debug gaze detection and engagement state
    //console.log('[DEBUGQ] FaceMesh processing frame, questionActive:', !!questionActiveRef.current, 'noClientPause:', noClientPause);
    
    // Proceed only if we're not in server mode and have landmarks
    if (!noClientPause && 
        results && 
        results.multiFaceLandmarks && 
        Array.isArray(results.multiFaceLandmarks) && 
        results.multiFaceLandmarks.length > 0 && 
        results.multiFaceLandmarks[0]) {
      
      try {
        // Try to estimate gaze from the landmarks
        const gaze = estimateGaze(results.multiFaceLandmarks[0]);
        setCurrentGaze(gaze); // update current gaze state
        // Display status with current gaze
        setFaceMeshStatus(`Working (current gaze: ${gaze})`);
        
        // Always process the gaze detection - the engagement logic inside 
        // handleVideoPlayback will check if there's an active question
        //console.log('[DEBUGQ] Gaze detected:', gaze);
        handleVideoPlayback(gaze);
      } catch (error) {
        // Log error but don't break the application flow
        console.log('Gaze estimation error, will retry on next frame:', error.message);
        // Still show status but don't set error state
        setCurrentGaze('Looking center');
        setFaceMeshStatus('Waiting for clearer face detection');
        
        // Return to looking center as fallback
        handleVideoPlayback('Looking center');
      }
    } else if (!noClientPause) {
      // No landmarks but not an error - just waiting
      setCurrentGaze('');
      setFaceMeshStatus('Searching for face');
    }
  }, [mode, noClientPause, handleVideoPlayback, questionActiveRef]);

  const handleFaceMeshStatus = useCallback((status) => {
    setFaceMeshStatus(status);
    if (status === 'FaceMesh Ready') {
      setFaceMeshReady(true);
      if (playerRef.current) {
        setTimeout(() => {
          handleVideoResume(
            lectureInfo.videoId,
            'basic',
            sendIntervalSeconds,
            () => playerRef.current?.getCurrentTime() || 0
          );
        }, 500);
      }
    }
  }, [lectureInfo.videoId, sendIntervalSeconds]);

  // Always run FaceMesh once loaded to maintain gaze detection across pauses
  useFaceMesh(loaded, webcamRef, handleFaceMeshResults, handleFaceMeshStatus, handleFaceMeshErrorState);

  useEffect(() => {
    if (!playerRef.current || !faceMeshReady) return;
    const initTimeout = setTimeout(() => {
      if (playerRef.current && faceMeshReady && !isVideoPaused) {
        handleVideoResume(
          lectureInfo.videoId,
          'basic',
          sendIntervalSeconds,
          () => playerRef.current?.getCurrentTime() || 0
        );
      }
    }, 2000);
    return () => clearTimeout(initTimeout);
  }, [faceMeshReady, playerRef.current, sendIntervalSeconds, lectureInfo.videoId, isVideoPaused]);

  const handleAnswer = (selectedKey) => {
    console.log('[DEBUGQ] Answer selected:', selectedKey);
    
    if (selectedKey === 'continue') {
      setCurrentQuestion(null);
      playerRef.current.playVideo();
      setIsPlaying(true);
      setPauseStatus('Playing');
      setVideoPlaying(true);
      
      // Reset gaze timers to start fresh detection
      immediateGaze.current = 'Looking center';
      stableGaze.current = 'Looking center';
      immediateGazeChangeTime.current = Date.now();
      stableGazeChangeTime.current = Date.now();
      
      // Make sure to reset the system pause flag
      systemPauseRef.current = false;
      
      // Reset the cooldown timer and make sure engagement detection is enabled
      markQuestionAsked();
      setEngagementDetectionEnabled(true);
      // Reset gaze display and status to restart detection UI
      setCurrentGaze('');
      setFaceMeshStatus('Searching for face');
      console.log('[DEBUGQ] Continue selected, resetting cooldown timer and gaze. Engagement detection enabled:', getEngagementDetectionEnabled());
      return;
    }

    if (selectedKey === 'dontknow') {
      setStats(prev => ({
        ...prev,
        wrong: prev.wrong + 1
      }));
      setDecisionPending(false);
      // Reset the cooldown timer even for "don't know"
      markQuestionAsked();
      console.log('[DEBUGQ] "Don\'t know" selected, resetting cooldown timer');
      return;
    }

    const correctKey = 'answer1';
    const isCorrect = selectedKey === correctKey;
    setStats(prev => ({
      ...prev,
      [isCorrect ? 'correct' : 'wrong']: prev[isCorrect ? 'correct' : 'wrong'] + 1
    }));
    setDecisionPending(isCorrect);
    // Reset the cooldown timer
    markQuestionAsked();
    console.log('[DEBUGQ] Answer processed, correctness:', isCorrect);
  };

  const handleDecision = (action) => {
    console.log('[DEBUGQ] Decision action received:', action);
    
    if (action === 'rewind') {
      const rewindTime = Math.max(0, currentQuestion.originalTime - 4); 
      if (typeof rewindTime === 'number' && !isNaN(rewindTime)) {
        console.log(`[DEBUGQ] Rewinding video to ${rewindTime}s`);
        playerRef.current.seekTo(rewindTime, true);
      }
    }

    if (decisionPending === true) {
      setQuestions(prev => {
        const updated = prev.filter(q => q.q_id !== currentQuestion.q_id);
        return updated;
      });
      setAnsweredQIDs(prev => [...prev, currentQuestion.q_id]);
      console.log('[DEBUGQ] Question marked as correctly answered');
    }

    // Reset question states
    setCurrentQuestion(null);
    setDecisionPending(null);
    
    // Reset system state
    systemPauseRef.current = false;
    
    // Reset gaze timers to restart engagement detection
    immediateGaze.current = 'Looking center';
    stableGaze.current = 'Looking center';
    immediateGazeChangeTime.current = Date.now();
    stableGazeChangeTime.current = Date.now();
    
    // Reset cooldown timer and explicitly re-enable engagement detection
    markQuestionAsked();
    setEngagementDetectionEnabled(true);
    // Reset gaze display and status to restart detection UI
    setCurrentGaze('');
    setFaceMeshStatus('Searching for face');
    console.log('[DEBUGQ] Decision handled, resetting cooldown timer and gaze. Engagement detection enabled:', getEngagementDetectionEnabled());
    
    // Resume playback
    playerRef.current.playVideo();
    setIsPlaying(true);
    setPauseStatus('Playing');
    setVideoPlaying(true);
  };

  const onPlayerReady = (event) => {
    playerRef.current = event.target;
    console.log("Player ready, starting video");

    // Get player dimensions if needed (might be fixed)
    const iframe = playerRef.current.getIframe();
    if (iframe) {
      setPlayerHeight(iframe.offsetHeight);
    }

    if (initialPlaybackTime > 0) {
      console.log(`🔄 Seeking video to ${initialPlaybackTime}s.`);
      playerRef.current.seekTo(initialPlaybackTime, true);
    }

    playerRef.current.playVideo();
    
    setTimeout(() => {
      handleVideoResume(
        lectureInfo.videoId,
        'basic',
        sendIntervalSeconds,
        () => playerRef.current?.getCurrentTime() || 0
      );
      setIsPlaying(true);
      setPauseStatus('Playing');
    }, 1000);

    if (onVideoPlayerReady) onVideoPlayerReady();
  };
  
  const onPlayerStateChange = (event) => {
    const playerState = event.data;
  
    switch (playerState) {
      case 1:
        setIsPlaying(true);
        setPauseStatus('Playing');
        setUserPaused(false);
        setIsVideoPaused(false);
        setVideoPlaying(true);
        handleVideoResume(
          lectureInfo.videoId, 
          'basic', 
          sendIntervalSeconds,
          () => playerRef.current?.getCurrentTime() || 0
        );
        break;
      case 2:
        if (systemPauseRef.current) {
          setPauseStatus('Paused (Not Engaged)');
        } else {
          setPauseStatus('Paused Manually');
          setUserPaused(true);
        }
        setIsPlaying(false);
        setIsVideoPaused(true);
        setVideoPlaying(false);
        handleVideoPause();
        break;
      default:
        break;
    }
  };
  
  const handleIntervalChange = (newValue) => {
    setSendIntervalSeconds(Number(newValue));
  };

  const handleLanguageChange = (language) => {
    serviceHandleLanguageChange(
      language,
      setSelectedLanguage,
      hebrewQuestions,
      englishQuestions,
      questionsRef,
      setQuestions
    );
  };

  useEffect(() => {
    setModelResultCallback((result) => {
      setLastModelResult(result);
      if (noClientPause && result < MODEL_THRESHOLD) {
        handleLowEngagement();
      }
    });

    return () => setModelResultCallback(null); // Ensure callback is removed on unmount or dependency change
  }, [noClientPause, handleLowEngagement]);

  useEffect(() => {
    if (debugTriggerActive) {
      handleLowEngagement();
      setDebugTriggerActive(false);
    }
  }, [debugTriggerActive, handleLowEngagement]);

  const handleResetAnsweredQuestions = () => {
    serviceResetAnsweredQuestions(lectureInfo.videoId, setAnsweredQIDs);
  };

  const handlePlotResults = async () => {
    servicePlotResults(
      lectureInfo.videoId,
      showResultsChart,
      setShowResultsChart,
      setResultsChartData,
      lectureInfo.videoDuration
    );
  }

  const handleAllPlotResults = async () => {
    serviceAllPlotResults(
      lectureInfo.videoId,
      showAllResultsChart,
      setAllShowResultsChart,
      setAllResultsChartData,
      lectureInfo.videoDuration
    );
  }

  const handleToggleTimeline = () => {
    setShowTimeline(prev => !prev);
  };

  // Add handler for seeking to timestamp when a question is clicked
  const handleQuestionClick = useCallback((timestamp) => {
    if (playerRef.current) {
      console.log(`🎯 Seeking to ${formatTime(timestamp)}`);
      playerRef.current.seekTo(timestamp, true);
      
      // If video is paused, play it
      if (!isPlaying) {
        playerRef.current.playVideo();
      }
    }
  }, [isPlaying]);

  // Enhanced manual trigger handler for more reliable question triggering
  const handleManualTrigger = useCallback(() => {
    console.log('[DEBUGQ] Manual trigger button clicked');
    
    if (currentQuestion) {
      console.log('[DEBUGQ] Cannot trigger new question while one is active');
      return;
    }
    
    // First make sure video playing state is correct
    setVideoPlaying(true);
    
    // Call the startManualTrigger function from videoLogic.js
    // This now sets forceQuestionTrigger to true
    startManualTrigger();
    
    // For immediate trigger, directly call handleLowEngagement
    console.log('[DEBUGQ] Directly calling handleLowEngagement from manual trigger');
    
    // Exit fullscreen if active
    exitFullScreenIfActive();
    
    // Pause the video first if it's playing
    if (isPlaying && playerRef.current) {
      console.log('[DEBUGQ] Pausing video for manual question');
      playerRef.current.pauseVideo();
      setIsPlaying(false);
      systemPauseRef.current = true;
    }
    
    // Short timeout to ensure pause has taken effect
    setTimeout(() => {
      // This will trigger the question since forceQuestionTrigger is now true
      handleLowEngagement();
    }, 50);
  }, [handleLowEngagement, exitFullScreenIfActive, currentQuestion, isPlaying]);
  const renderStatus = () => (
    <div className="status-info">
      <p>Mode: {mode}</p>
      <p>Status: {pauseStatus}</p>
      <p>FaceMesh: {noClientPause ? 'Server Logic' : faceMeshStatus}</p>
      {!noClientPause && <p>Current Gaze: {currentGaze || 'N/A'}</p>}
      <p>Server Model Result: <span>{lastModelResult !== null ? lastModelResult.toFixed(3) : 'N/A'}</span></p>

      
      {/* Display FaceMesh error message */}
      {faceMeshError && (
        <div className="facemesh-error">
          <span className="error-icon">⚠️</span>
          FaceMesh Error - Please refresh the page or click retry below
          {showRetryButton && (
            <button className="retry-button" onClick={handleFaceMeshRetry}>
              Retry FaceMesh
            </button>
          )}
        </div>
      )}
        {/* Buffer and Requests info - shown in both modes */}
      <div className="buffer-status">
        <p>Buffer Frames: <span className="buffer-count">{bufferFrames}/{REQUIRED_FRAMES}</span></p>
        <div className="buffer-progress">
          <div 
            className="buffer-bar" 
            style={{ width: `${(bufferFrames / REQUIRED_FRAMES) * 100}%` }}
          ></div>
        </div>
      </div>
      
      {/* Show requests info in both client and server modes */}
      <div className="requests-count">
        <p>Requests Sent: <span>{requestsSent}</span></p>
      </div>
        {/* Server specific info */}
      {noClientPause && (
        <div className={`model-result ${lastModelResult !== null && lastModelResult < MODEL_THRESHOLD ? 'low-engagement' : ''}`}>
          <p>Server Model Result: <span>{lastModelResult !== null ? lastModelResult.toFixed(3) : 'N/A'}</span>
          {lastModelResult !== null && lastModelResult < MODEL_THRESHOLD && <span className="alert-indicator"> ⚠️ Low Engagement</span>}</p>
        </div>
      )}
      
      <button 
        className={`control-button ${noClientPause ? 'active' : ''}`}
        onClick={handleNoClientPauseToggle}
      >
        {noClientPause ? '🤖 Server Control' : '👁️ Client Control'}
      </button>
      <div style={{ margin: '15px 0' }}>
        <label>Send Interval: {sendIntervalSeconds}s</label>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.5"
          value={sendIntervalSeconds}
          onChange={(e) => handleIntervalChange(e.target.value)}
        />
      </div>
    </div>
  );

  const renderDebugTools = () => (
    <div className="debug-tools">
      <h3>Debug Tools</h3>
      <div className="sensitivity-control">
        <label> Engagement Sensitivity: {sensitivity}</label>
        <input
          type="range"
          min="0"
          max="10"
          value={sensitivity}
          onChange={e => setSensitivity(+e.target.value)}
        />
      </div>
      <button 
        className="debug-button trigger"
        onClick={handleManualTrigger}
      >
        🎯 Trigger Question
      </button>
      <button 
        className="debug-button reset-answers"
        onClick={handleResetAnsweredQuestions}
      >
        🔄 Reset Answered Qs
      </button>
      <button
        className="debug-button"
        onClick={handlePlotResults}
      >
        {showResultsChart ? 'Hide Results' : 'Plot Results'}
      </button>
      <button
        className="debug-button"
        onClick={handleToggleTimeline}
      >
        {showTimeline ? 'Hide' : 'Show'} Timeline
      </button>
      <button
        className="debug-button"
        onClick={handleAllPlotResults}
      >
        {showAllResultsChart ? 'Hide all watcher\'s results' : 'Plot all watchers\' results'}
      </button>
    </div>
  );

  return (
    <div className="video-player-layout video-player-grid-layout"> {/* Main layout container */}

      <div className="video-section"> {/* Wrapper for player and controls */}
        <YouTube
          videoId={lectureInfo.videoId}
          opts={{
            height: String(playerHeight),
            width: '640',
            playerVars: { autoplay: 1, controls: 1, origin: window.location.origin },
          }}
          onReady={onPlayerReady}
          onStateChange={onPlayerStateChange}
        />
        {renderStatus()}
        {mode === 'question' && renderDebugTools()}

        {mode === 'question' && (
          <div className="language-options" style={{ margin: '20px 0', direction: 'ltr' }}>
            <button 
              className={`lang-btn ${selectedLanguage === 'Hebrew' ? 'active' : ''} ${hebrewQuestions.length === 0 ? 'disabled' : ''}`}
              onClick={() => handleLanguageChange('Hebrew')}
              disabled={hebrewQuestions.length === 0 && !hebrewStatus?.includes('Building')}
            >
              Hebrew {hebrewStatus ? (
                hebrewStatus.includes('Building') ? '⌛' : 
                hebrewStatus.includes('No') ? '❌' : '⏳'
              ) : (
                hebrewQuestions.length > 0 ? '✓' : '❌'
              )}
              {hebrewStatus && hebrewStatus.includes('Building') && 
                <span className="status-counter">#{retryCount.hebrew}</span>}
            </button>
            <button 
              className={`lang-btn ${selectedLanguage === 'English' ? 'active' : ''} ${englishQuestions.length === 0 ? 'disabled' : ''}`}
              onClick={() => handleLanguageChange('English')}
              disabled={englishQuestions.length === 0 && !englishStatus?.includes('Building')}
            >
              English {englishStatus ? (
                englishStatus.includes('Building') ? '⌛' : 
                englishStatus.includes('No') ? '❌' : '⏳'
              ) : (
                englishQuestions.length > 0 ? '✓' : '❌'
              )}
              {englishStatus && englishStatus.includes('Building') && 
                <span className="status-counter">#{retryCount.english}</span>}
            </button>
          </div>
        )}


        {showResultsChart && (
          <div
            className="results-plot-chart"
          >
            <h3>Focus Results Over Time</h3>
            <Line
              data={resultsChartData}
              options={{
                maintainAspectRatio: false,
                scales: {
                  x: {title: { display: true, text: 'Video Time' },},
                  y: { title: { display: true, text: 'Concentration' }, min: 0 },
                },
                plugins: { legend: { display: true } },
              }}
            />
          </div>
        )}

        {showAllResultsChart && (
          <div
            className="results-plot-chart"
          >
            <h3>Focus Results All Watchers</h3>
            <Line
              data={resultsAllChartData}
              options={{
                maintainAspectRatio: false,
                scales: {
                  x: { title: { display: true, text: 'Video Time' }, },
                  y: { title: { display: true, text: 'Concentration' }, min: 0 },
                },
                plugins: { legend: { display: true } },
              }}
            />
          </div>
        )}
        
        {mode === 'question' && (hebrewStatus || englishStatus) && (
          <div className="question-generation-status" style={{ margin: '10px 0 20px', textAlign: 'center' }}>
            {selectedLanguage === 'Hebrew' && hebrewStatus && (
              <div className="status-message">
                {hebrewStatus.includes('No') ? (
                  <span className="error-icon">⚠️</span>
                ) : (
                  <span className="spinner small"></span>
                )}
                {hebrewStatus}
              </div>
            )}
            {selectedLanguage === 'English' && englishStatus && (
              <div className="status-message">
                {englishStatus.includes('No') ? (
                  <span className="error-icon">⚠️</span>
                ) : (
                  <span className="spinner small"></span>
                )}
                {englishStatus}
              </div>
            )}
          </div>
        )}
      </div> {/* End of video-section */}

      {mode === 'question' && showTimeline && (
        <div className="timeline-section"> {/* Wrapper for the timeline */}
          <QuestionTimeline
            questions={questions}
            currentTime={currentTime}
            language={selectedLanguage}
            playerHeight={playerHeight}
            onQuestionClick={handleQuestionClick}
          />
        </div>
      )}

      <video 
        ref={webcamRef}
        style={{ display: 'none' }}
        playsInline
        muted
        autoPlay
      />
      {currentQuestion && (
        <QuestionModal 
          question={currentQuestion} 
          onAnswer={handleAnswer} 
          language={selectedLanguage}
        />
      )}
      {decisionPending !== null && (
        <DecisionModal 
          isCorrect={decisionPending} 
          onDecision={handleDecision}
          language={selectedLanguage}
        />
      )}
      <EyeDebugger enabled={false} />
    </div>
  );
}

export default VideoPlayer;