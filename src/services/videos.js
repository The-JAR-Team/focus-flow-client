import axios from "axios";
import { config } from '../config/config';

const VIDEO_METADATA_URL = 'https://raw.githubusercontent.com/The-JAR-Team/viewDataFromDataBase/refs/heads/main/fetch/video_metadata.json';
const VIDEO_TRANSCRIPT_URL = 'https://raw.githubusercontent.com/The-JAR-Team/viewDataFromDataBase/refs/heads/main/transcripts';

export const fetchVideoMetadata = async () => {
  const response = await axios.get(`${config.baseURL}/videos/accessible`, { withCredentials: true });
  if (response.status !== 200) throw new Error("Failed to fetch video metadata");
  return response.data;
};

export const fetchTranscriptQuestions = async (videoId, language) => {
  try {
    const response = await axios.get(`${config.baseURL}/videos/${videoId}/questions?lang=${language}`, { withCredentials: true });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${language} questions:`, error);
    return { video_questions: { questions: [] } };
  }
};

export const fetchTranscriptQuestionsForVideo = async (externalId, lang = 'Hebrew') => {
  try {
    const response = await axios.get(`${config.baseURL}/videos/${externalId}/questions?lang=${lang}`);
    const data = response.data;
    return [
      ...(data.video_questions?.questions || []),
      ...(data.generic_questions?.questions || []),
      ...(data.subject_questions?.questions || [])
    ];
  } catch (error) {
    console.error('Error fetching questions:', error);
    return [];
  }
};

// Tracking constants
export const TRACKING_FPS = 10;
export const FRAME_INTERVAL = 100;   // Collect frame every 100ms to complete 100 frames in 10 seconds
export const MAX_BUFFER_DURATION_SECONDS = 10; // always keep last 10 seconds
export const MAX_BUFFER_SIZE = TRACKING_FPS * MAX_BUFFER_DURATION_SECONDS;
export const REQUIRED_FRAMES = 100;  // We always want 100 frames

let landmarkBuffer = [];
let latestLandmark = null;
let trackingInterval = null;
let sendingInterval = null;
let isVideoPaused = false;

let lastModelResult = null;
let onModelResultCallback = null;

export const setModelResultCallback = (callback) => {
  onModelResultCallback = callback;
};

export const resetTracking = () => {
  isVideoPaused = true;
  landmarkBuffer = [];
  clearInterval(trackingInterval);
  clearInterval(sendingInterval);
  console.log('🔄 Tracking reset, buffer cleared, and intervals stopped.');
};

export const handleVideoPause = () => {
  resetTracking();
  console.log('🛑 Video paused.');
};

export const handleVideoResume = (youtube_id, model = 'v1', sendIntervalSeconds = 10, getCurrentTime = () => 0) => {
  clearInterval(trackingInterval);
  clearInterval(sendingInterval);

  isVideoPaused = false;
  landmarkBuffer = [];

  console.log(`▶️ Video tracking started: collecting frame every ${FRAME_INTERVAL}ms, sending every ${sendIntervalSeconds}s.`);

  // Collect frames at fixed intervals
  trackingInterval = setInterval(() => {
    if (isVideoPaused || !latestLandmark) return;

    landmarkBuffer.push({
      timestamp: Date.now(),
      landmarks: latestLandmark
    });

    // Keep only the most recent 100 frames
    if (landmarkBuffer.length > REQUIRED_FRAMES) {
      landmarkBuffer.shift();
    }
  }, FRAME_INTERVAL);

  // Skip sending data to server if in client mode (window.noStop is false)
  if (!window.noStop) {
    console.log('🚫 Client mode active - skipping server logs');
    return;
  }

  // Send data at specified intervals (only in server mode)
  sendingInterval = setInterval(async () => {
    if (landmarkBuffer.length < REQUIRED_FRAMES) {
      console.log(`⚠️ Not enough frames yet (${landmarkBuffer.length}/${REQUIRED_FRAMES})`);
      return;
    }

    // Always send exactly 100 frames
    const relevantLandmarks = landmarkBuffer
      .slice(-REQUIRED_FRAMES)
      .map(item => item.landmarks);

    const payload = {
      youtube_id: youtube_id,
      current_time: getCurrentTime(), // Use the video's current time
      extraction: "mediapipe",
      extraction_payload: {
        fps: 10,
        interval: 10,
        number_of_landmarks: 478,
        landmarks: [relevantLandmarks]
      },
      model: "v1"
    };

    try {
      const response = await axios.post(`${config.baseURL}/watch/log_watch`, payload, { withCredentials: true });
      const modelResult = response.data?.model_result;
      lastModelResult = modelResult;
      
      if (onModelResultCallback) {
        onModelResultCallback(modelResult);
      }
      
      console.log(`✅ Sent ${REQUIRED_FRAMES} frames successfully. Model result:`, modelResult);
    } catch (error) {
      console.error('❌ Error sending landmarks:', error);
    }
  }, sendIntervalSeconds * 1000);
};

export const updateLatestLandmark = (faceMeshResults) => {
  if (faceMeshResults?.multiFaceLandmarks?.[0]) {
    latestLandmark = faceMeshResults.multiFaceLandmarks[0];
  } else {
    console.warn('⚠️ No landmarks detected.');
  }
};


export const fetchLastWatchTime = async (youtube_id) => {
  try {
    const response = await axios.post(
      `${config.baseURL}/watch/get`,
      { youtube_id },
      { withCredentials: true }
    );
    return response.data?.watch_item?.current_time || 0;
  } catch (error) {
    console.error('❌ Error fetching last watched time:', error);
    return 0;
  }
};