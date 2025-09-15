export const config = {
    //baseURL: 'http://localhost:5000', // Change this according to your backend URL
    //baseURL: 'https://focus-flow-server-465005663226.me-west1.run.app/api', // Change this according to your backend URL
    baseURL: 'https://focusflow.art/api',
    // baseURL: 'https://focus-flow-236589840712.me-west1.run.app',
    // baseURL: 'https://focus-flow-server-465005663226.me-west1.run.app',
    
};

//export const BASE_URL = 'https://focus-flow-server-465005663226.me-west1.run.app/api';
export const BASE_URL = 'https://focusflow.art/api';
// Constants for model operations
export const ONNX_CONFIG = {
  // Whether to use fallback server processing if local inference fails
  useFallback: true,
  // Fallback server endpoint (uses the same endpoint as before)
  fallbackEndpoint: `${BASE_URL}/watch/log_watch`,
  // Number of local inference errors before switching to server fallback
  maxLocalErrors: 3,
  // Whether to log additional debug information
  debug: false,
  // Model management
  enableModelSwitching: true,
  // Whether to show model selection UI
  showModelSelector: true,
};
