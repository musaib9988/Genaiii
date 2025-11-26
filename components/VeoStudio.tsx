import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { AspectRatio } from '../types';

const VeoStudio: React.FC = () => {
  const [prompt, setPrompt] = useState('Cinematic motion, high quality');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setGeneratedVideoUrl(null);
      setError(null);
    }
  };

  const checkApiKey = async () => {
    // Check if running in the specific environment with window.aistudio
    if (window.aistudio?.hasSelectedApiKey && window.aistudio?.openSelectKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        try {
            await window.aistudio.openSelectKey();
            // Mitigation for race condition: Assume true after selection
            return true;
        } catch (error) {
            console.error("API Key selection failed/cancelled", error);
            return false;
        }
      }
      return hasKey;
    }
    return true; // Fallback for other environments
  };

  const generateVideo = async () => {
    if (!selectedFile) {
      setError('Please select an image first.');
      return;
    }

    setIsGenerating(true);
    setStatusMessage('Checking API Key...');
    setError(null);
    setGeneratedVideoUrl(null);

    try {
      let hasKey = await checkApiKey();
      if (!hasKey) {
        throw new Error("API Key selection is required for Veo generation.");
      }

      setStatusMessage('Initializing Veo session...');
      
      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
           const res = reader.result as string;
           resolve(res.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      setStatusMessage('Sending request to Gemini...');

      let ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let operation;

      try {
          operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            image: {
              imageBytes: base64Data,
              mimeType: selectedFile.type,
            },
            config: {
              numberOfVideos: 1,
              resolution: '720p', // Veo fast preview supports 720p
              aspectRatio: aspectRatio,
            }
          });
      } catch (err: any) {
          // Retry logic if entity not found (often due to stale key or project issues)
          if (err.message && (err.message.includes('Requested entity was not found') || err.message.includes('403'))) {
              console.log("Caught entity not found or 403, triggering re-selection...");
              if (window.aistudio?.openSelectKey) {
                  await window.aistudio.openSelectKey();
                  // Re-initialize client with potentially new key env
                  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                  operation = await ai.models.generateVideos({
                    model: 'veo-3.1-fast-generate-preview',
                    prompt: prompt,
                    image: {
                      imageBytes: base64Data,
                      mimeType: selectedFile.type,
                    },
                    config: {
                      numberOfVideos: 1,
                      resolution: '720p',
                      aspectRatio: aspectRatio,
                    }
                  });
              } else {
                  throw err;
              }
          } else {
              throw err;
          }
      }

      setStatusMessage('Dreaming... This may take a moment.');

      // Polling loop
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
        setStatusMessage('Still dreaming... generating pixels...');
        operation = await ai.operations.getVideosOperation({operation: operation});
      }

      if (operation.error) {
        throw new Error(operation.error.message || 'Video generation failed.');
      }

      const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) {
        throw new Error('No video URI returned.');
      }

      setStatusMessage('Downloading video...');
      
      // Robustly append API key to the URL
      // API URIs might not have query params yet, so we must check before appending with & or ?
      const separator = videoUri.includes('?') ? '&' : '?';
      // Fallback to empty string if process.env.API_KEY is undefined to avoid literal "undefined"
      const apiKeyParam = process.env.API_KEY ? `key=${process.env.API_KEY}` : ''; 
      const videoUrlWithKey = apiKeyParam ? `${videoUri}${separator}${apiKeyParam}` : videoUri;
      
      const videoRes = await fetch(videoUrlWithKey);
      if (!videoRes.ok) {
        throw new Error(`Failed to download video file (${videoRes.status}).`);
      }
      
      const videoBlob = await videoRes.blob();
      const localVideoUrl = URL.createObjectURL(videoBlob);
      
      setGeneratedVideoUrl(localVideoUrl);
      setStatusMessage('Complete!');

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Veo Video Creator
        </h2>
        <p className="text-gray-400">Bring your images to life with Veo 3.1</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls Column */}
        <div className="lg:col-span-4 space-y-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm">
          
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Source Image</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              {previewUrl ? (
                 <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-sm font-medium">Change Image</span>
                    </div>
                 </div>
              ) : (
                <div className="text-center space-y-2">
                    <svg className="w-10 h-10 text-gray-500 mx-auto group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-gray-400">Click to upload image</p>
                </div>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Prompt (Optional)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none h-24"
              placeholder="Describe the motion..."
            />
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Aspect Ratio</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAspectRatio('16:9')}
                className={`p-3 rounded-lg border text-sm font-medium transition-all ${aspectRatio === '16:9' ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
              >
                Landscape (16:9)
              </button>
              <button
                onClick={() => setAspectRatio('9:16')}
                className={`p-3 rounded-lg border text-sm font-medium transition-all ${aspectRatio === '9:16' ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
              >
                Portrait (9:16)
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={generateVideo}
            disabled={isGenerating || !selectedFile}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
              isGenerating || !selectedFile
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-purple-900/30'
            }`}
          >
            {isGenerating ? 'Generating...' : 'Generate Video'}
          </button>
          
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Preview/Result Column */}
        <div className="lg:col-span-8 flex flex-col justify-center items-center bg-black/40 rounded-3xl border border-gray-800/50 p-8 min-h-[500px] relative overflow-hidden backdrop-blur-md">
           {isGenerating && (
             <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
               <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
               <p className="text-purple-200 animate-pulse">{statusMessage}</p>
             </div>
           )}
           
           {generatedVideoUrl ? (
             <div className="w-full h-full flex items-center justify-center">
               <video 
                src={generatedVideoUrl} 
                controls 
                autoPlay 
                loop 
                className={`max-h-[600px] rounded-lg shadow-2xl ${aspectRatio === '9:16' ? 'max-w-sm' : 'w-full'}`}
               />
             </div>
           ) : previewUrl ? (
              <div className="text-center opacity-50">
                 <img 
                    src={previewUrl} 
                    className={`max-h-[400px] rounded-lg grayscale blur-[2px] transform scale-95 transition-all duration-700 ${isGenerating ? 'scale-100 blur-0 grayscale-0' : ''}`}
                    alt="Preview base"
                 />
                 {!isGenerating && <p className="mt-4 text-gray-400">Preview ready. Click generate to animate.</p>}
              </div>
           ) : (
             <div className="text-center text-gray-500 space-y-4">
               <div className="w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
               </div>
               <p className="text-lg font-medium">No video generated yet</p>
               <p className="text-sm">Upload an image and configure settings to start.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default VeoStudio;