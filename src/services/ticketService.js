import axios from 'axios';
import { config } from '../config/config';

/**
 * Ticket Service for managing video watching sessions and batch engagement logging
 * 
 * This service integrates with the new API endpoints:
 * - POST /ticket/next - Initialize video watching session
 * - POST /ticket/next_sub - Handle pause/seek/buffer reset events
 * - POST /watch/log_watch_batch - Send batch engagement data
 */

// Session state management
let currentTicketId = null; // main_ticket
let currentSubTicketId = null; // sub_ticket  
let currentVideoId = null;
let engagementDataBatch = [];
let batchInterval = null;
let sessionStartTime = null;
let isSubTicketLoading = false; // Track sub ticket request state

// Note: No longer using localStorage - all ticket state managed server-side

// Configuration
const BATCH_MULTIPLIER = 6; // Send batch every sendIntervalSeconds * 6
const MAX_BATCH_SIZE = 50; // Maximum number of entries per batch
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Get existing ticket from server
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object|null>} - Ticket data or null if failed
 */
const getCurrentTicketFromServer = async (videoId) => {
  try {
    console.log(`🎫 Checking for existing ticket on server for video: ${videoId}`);
    
    const response = await axios.get(
      `${config.baseURL}/ticket/current?youtube_id=${videoId}`,
      { withCredentials: true }
    );

    if (response.data && response.data.status === 'success') {
      console.log(`✅ Found existing ticket on server:`, response.data);
      return {
        main_ticket: response.data.main_ticket,
        sub_ticket: response.data.sub_ticket
      };
    } else {
      console.log(`⚠️ No existing ticket found on server:`, response.data);
      return null;
    }
  } catch (error) {
    console.log(`⚠️ Failed to get ticket from server:`, error.message);
    return null;
  }
};

/**
 * Initialize a new video watching session
 * @param {string} videoId - YouTube video ID
 * @param {boolean} forceNew - Force creation of new ticket even if one exists
 * @returns {Promise<string|null>} - Ticket ID or null if failed
 */
export const initializeVideoSession = async (videoId, forceNew = false) => {
  try {
    // First try to get existing ticket from server (unless forcing new)
    if (!forceNew) {
      const existingTicket = await getCurrentTicketFromServer(videoId);
      if (existingTicket) {
        console.log(`🎫 Using existing ticket from server: main=${existingTicket.main_ticket}, sub=${existingTicket.sub_ticket}`);
        currentTicketId = existingTicket.main_ticket;
        currentSubTicketId = existingTicket.sub_ticket;
        currentVideoId = videoId;
        sessionStartTime = Date.now();
        
        // Clear any existing batch data
        engagementDataBatch = [];
        
        return currentTicketId;
      }
    }
    
    console.log(`🎫 ${forceNew ? 'Force creating new' : 'Creating new'} video session for: ${videoId}`);
    
    const response = await axios.post(
      `${config.baseURL}/ticket/next`,
      { youtube_id: videoId },
      { withCredentials: true }
    );    if (response.data && (response.data.main_ticket || response.data.ticket_id)) {
      // Handle both response formats: new API returns main_ticket, fallback to ticket_id
      currentTicketId = response.data.main_ticket || response.data.ticket_id;
      currentSubTicketId = response.data.sub_ticket || null;
      currentVideoId = videoId;
      sessionStartTime = Date.now();
      
      // Clear any existing batch data
      engagementDataBatch = [];
      
      console.log(`✅ Video session initialized. Main ticket: ${currentTicketId}, Sub ticket: ${currentSubTicketId || 'N/A'}`);
      return currentTicketId;
    } else {
      console.error('❌ Failed to get ticket ID from response:', response.data);
      return null;
    }
  } catch (error) {
    console.error('❌ Error initializing video session:', error);
    return null;
  }
};

/**
 * Handle video events (pause, seek, buffer reset)
 * @param {string} eventType - Event type ('pause', 'seek', 'buffer_reset')
 * @param {number} currentTime - Current video time in seconds
 * @param {Object} additionalData - Additional event-specific data
 * @returns {Promise<boolean>} - Success status
 */
export const handleVideoEvent = async (eventType, currentTime, additionalData = {}) => {
  if (!currentTicketId || !currentVideoId) {
    console.warn('⚠️ No active ticket ID or video ID for video event');
    return false;
  }

  try {
    console.log(`📡 Sending video event: ${eventType} at ${currentTime}s`, {
      ticket_id: currentTicketId,
      event_type: eventType,
      video_time: currentTime,
      ...additionalData
    });
    
    // Set loading state
    isSubTicketLoading = true;
    
    // API only expects youtube_id in the body
    const payload = {
      youtube_id: currentVideoId
    };

    const response = await axios.post(
      `${config.baseURL}/ticket/next_sub`,
      payload,
      { withCredentials: true }
    );    // Check if API returned a new sub ticket and update it
    if (response.data && response.data.sub_ticket) {
      currentSubTicketId = response.data.sub_ticket;
      console.log(`🎫 Updated sub ticket: ${currentSubTicketId}`);
    }

    console.log(`✅ Video event sent successfully: ${eventType}`, response.data);
    return true;
  } catch (error) {
    console.error(`❌ Error sending video event (${eventType}):`, error);
    return false;
  } finally {
    // Clear loading state
    isSubTicketLoading = false;
  }
};

/**
 * Add engagement data to the batch queue
 * @param {Object} engagementData - Engagement data to add
 */
export const addEngagementData = (engagementData) => {
  if (!currentTicketId) {
    console.warn('⚠️ No active session for engagement data');
    return;
  }

  // Add session metadata
  const dataWithMetadata = {
    ...engagementData,
    ticket_id: currentTicketId,
    youtube_id: currentVideoId,
    session_start_time: sessionStartTime,
    timestamp: Date.now()
  };

  engagementDataBatch.push(dataWithMetadata);
  
  // Prevent batch from growing too large
  if (engagementDataBatch.length > MAX_BATCH_SIZE) {
    console.log(`⚠️ Batch size exceeded ${MAX_BATCH_SIZE}, sending early batch`);
    sendBatchNow();
  }
};

/**
 * Send batch engagement data to server
 * @param {Array} batchData - Batch data to send (optional, uses current batch if not provided)
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<boolean>} - Success status
 */
export const sendEngagementBatch = async (batchData = null, retryCount = 0) => {
  const dataToSend = batchData || [...engagementDataBatch];
  
  if (dataToSend.length === 0) {
    console.log('📭 No engagement data to send');
    return true;
  }

  if (!currentVideoId) {
    console.warn('⚠️ No active video ID for batch sending');
    return false;
  }

  try {
    console.log(`📦 Sending engagement batch with ${dataToSend.length} entries`);
    
    // Get current time for batch metadata
    const currentTime = dataToSend.length > 0 ? 
      dataToSend[dataToSend.length - 1].video_time || 0 : 0;
    
    // Transform engagement data to expected API format
    const items = dataToSend.map(item => ({
      item_current_time_video: item.video_time || 0,
      model_result: item.engagement_score || 0,
      extraction_type: "mediapipe_client",
      interval_seconds: item.interval_seconds || 2.0,
      fps_at_extraction: 30,
      payload_details: {
        extracted_time_utc: new Date(item.processing_timestamp || Date.now()).toISOString(),
        client_processing_duration_ms: item.processing_duration_ms || 150,
        processing_mode: item.processing_mode || "client",
        landmarks_count: item.landmarks_count || 0
      }
    }));

    const payload = {
      youtube_id: currentVideoId,
      batch_current_time_video: currentTime,
      model_name: "DNN_v4_ONNX_Client",
      items: items
    };

    const response = await axios.post(
      `${config.baseURL}/watch/log_watch_batch`,
      payload,
      { withCredentials: true }
    );

    // Clear the sent data from batch if using current batch
    if (!batchData) {
      engagementDataBatch = [];
    }

    console.log(`✅ Engagement batch sent successfully (${dataToSend.length} entries)`);
    return true;

  } catch (error) {
    console.error(`❌ Error sending engagement batch (attempt ${retryCount + 1}):`, error);
    
    // Retry logic
    if (retryCount < MAX_RETRY_ATTEMPTS) {
      console.log(`🔄 Retrying batch send in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return sendEngagementBatch(dataToSend, retryCount + 1);
    } else {
      console.error(`❌ Failed to send batch after ${MAX_RETRY_ATTEMPTS} attempts`);
      return false;
    }
  }
};

/**
 * Send current batch immediately
 * @returns {Promise<boolean>} - Success status
 */
export const sendBatchNow = async () => {
  return await sendEngagementBatch();
};

/**
 * Start automatic batch sending interval
 * @param {number} sendIntervalSeconds - Base interval in seconds
 */
export const startBatchInterval = (sendIntervalSeconds) => {
  // Stop any existing interval
  stopBatchInterval();
  
  const batchIntervalMs = sendIntervalSeconds * BATCH_MULTIPLIER * 1000;
  console.log(`⏰ Starting batch interval: ${batchIntervalMs}ms (${sendIntervalSeconds}s * ${BATCH_MULTIPLIER})`);
  
  batchInterval = setInterval(() => {
    sendEngagementBatch();
  }, batchIntervalMs);
};

/**
 * Stop automatic batch sending interval
 */
export const stopBatchInterval = () => {
  if (batchInterval) {
    clearInterval(batchInterval);
    batchInterval = null;
    console.log('⏹️ Batch interval stopped');
  }
};

/**
 * Clean up session (send final batch and clear state)
 */
export const cleanupSession = async () => {
  console.log('🧹 Cleaning up video session...');
  
  // Stop batch interval
  stopBatchInterval();
  
  // Send any remaining engagement data
  if (engagementDataBatch.length > 0) {
    console.log(`📤 Sending final batch with ${engagementDataBatch.length} entries`);
    await sendEngagementBatch();
  }
  
  // Clear session state
  currentTicketId = null;
  currentVideoId = null;
  engagementDataBatch = [];
  sessionStartTime = null;
  
  console.log('✅ Session cleanup complete');
};

/**
 * Reset session and get new main ticket
 * @param {string} videoId - YouTube video ID  
 * @returns {Promise<string|null>} - New ticket ID or null if failed
 */
export const resetSessionAndGetNewTicket = async (videoId) => {
  console.log('🔄 Resetting session and getting new main ticket...');
  
  // Clean up current session
  await cleanupSession();
  
  // Force new ticket creation
  return await initializeVideoSession(videoId, true);
};

/**
 * Get current session status
 * @returns {Object} - Session status information
 */
export const getSessionStatus = () => {
  return {
    hasActiveSession: !!currentTicketId,
    ticketId: currentTicketId,
    mainTicket: currentTicketId,
    subTicket: currentSubTicketId,
    videoId: currentVideoId,
    batchSize: engagementDataBatch.length,
    sessionDuration: sessionStartTime ? Date.now() - sessionStartTime : 0,
    batchIntervalActive: !!batchInterval,
    isSubTicketLoading: isSubTicketLoading
  };
};

/**
 * Handle pause event specifically
 * @param {number} currentTime - Current video time
 * @returns {Promise<boolean>} - Success status
 */
export const handlePauseEvent = async (currentTime) => {
  return await handleVideoEvent('pause', currentTime, {
    pause_reason: 'user_action'
  });
};

/**
 * Handle seek event specifically
 * @param {number} fromTime - Previous time position
 * @param {number} toTime - New time position
 * @returns {Promise<boolean>} - Success status
 */
export const handleSeekEvent = async (fromTime, toTime) => {
  return await handleVideoEvent('seek', toTime, {
    from_time: fromTime,
    seek_distance: toTime - fromTime
  });
};

/**
 * Handle buffer reset event specifically
 * @param {number} currentTime - Current video time
 * @returns {Promise<boolean>} - Success status
 */
export const handleBufferResetEvent = async (currentTime) => {
  return await handleVideoEvent('buffer_reset', currentTime, {
    buffer_reason: 'engagement_tracking_reset'
  });
};

// Export configuration for external access
export const TICKET_CONFIG = {
  BATCH_MULTIPLIER,
  MAX_BATCH_SIZE,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY
};
