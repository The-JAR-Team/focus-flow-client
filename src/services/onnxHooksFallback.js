// This file provides a direct way to get the ONNX model file content at runtime
// by copying it from the hooks folder to the public folder if it doesn't exist

// Fetch the model file directly from the hooks folder
export const fetchModelFromHooks = async (modelFilename = 'engagement_multitask_v4.onnx') => {
  try {
    // Attempt to fetch from the hooks folder
    const response = await fetch(`../hooks/${modelFilename}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch model '${modelFilename}' from hooks folder: ${response.status}`);
    }
    
    const modelData = await response.arrayBuffer();
    console.log(`Successfully fetched model '${modelFilename}' from hooks folder`);
    
    // Use the Blob method to create an object URL
    const blob = new Blob([modelData], { type: 'application/octet-stream' });
    const modelUrl = URL.createObjectURL(blob);
    
    return modelUrl;
  } catch (error) {
    console.error(`Error fetching model '${modelFilename}' from hooks folder:`, error);
    return null;
  }
};
