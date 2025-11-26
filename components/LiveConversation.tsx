import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decodeAudioData, decode } from '../utils/audioUtils';

const LiveConversation: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Refs for audio processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Visualizer ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-4), msg]);
  };

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!analyserRef.current) return; // Exit if destroyed
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgb(10, 10, 15)'; // Dark background
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 1.5;
        
        // Gradient color
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#4f46e5');
        gradient.addColorStop(1, '#ec4899');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  };

  const stopConversation = async () => {
    // Clear analyzer immediately to stop visualizer loop access
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
    }
    analyserRef.current = null;

    // Close session
    if (sessionRef.current) {
      sessionRef.current = null;
    }

    // Stop microphone
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Stop audio context processing
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    
    // Stop playing sources
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();

    if (audioContextRef.current) {
      try { await audioContextRef.current.close(); } catch(e) { console.error(e); }
      audioContextRef.current = null;
    }

    setIsConnected(false);
    setIsSpeaking(false);
    addLog("Conversation ended");
  };

  const startConversation = async () => {
    setError(null);
    try {
      addLog("Requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      addLog("Initializing AudioContext...");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 24000 }); // Output sample rate
      audioContextRef.current = audioCtx;
      nextStartTimeRef.current = audioCtx.currentTime;

      // Setup Input Context (16k for model)
      const inputAudioCtx = new AudioContextClass({ sampleRate: 16000 });
      const source = inputAudioCtx.createMediaStreamSource(stream);
      const scriptProcessor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      // Setup Visualizer (using input stream)
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const visSource = audioCtx.createMediaStreamSource(stream);
      visSource.connect(analyser);
      drawVisualizer();

      addLog("Connecting to Gemini Live...");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: 'You are a helpful, witty, and concise AI assistant.',
        },
        callbacks: {
          onopen: () => {
            addLog("Connected!");
            setIsConnected(true);
            
            // Connect audio pipeline
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                  sessionRef.current = session;
                  session.sendRealtimeInput({ media: pcmBlob });
              }).catch(err => {
                  console.error("Session send error", err);
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
               setIsSpeaking(true);
               
               // Sync time
               nextStartTimeRef.current = Math.max(
                 nextStartTimeRef.current,
                 audioCtx.currentTime
               );

               const audioBuffer = await decodeAudioData(
                 decode(base64Audio),
                 audioCtx,
                 24000,
                 1
               );

               const sourceNode = audioCtx.createBufferSource();
               sourceNode.buffer = audioBuffer;
               
               // Connect to output and also to analyser for visualizer
               sourceNode.connect(audioCtx.destination);
               sourceNode.connect(analyser); 

               sourceNode.addEventListener('ended', () => {
                 sourcesRef.current.delete(sourceNode);
                 if (sourcesRef.current.size === 0) setIsSpeaking(false);
               });

               sourceNode.start(nextStartTimeRef.current);
               nextStartTimeRef.current += audioBuffer.duration;
               sourcesRef.current.add(sourceNode);
            }
            
            // Handle Interruption
            if (message.serverContent?.interrupted) {
                addLog("Interrupted");
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = audioCtx.currentTime;
                setIsSpeaking(false);
            }
          },
          onclose: () => {
            addLog("Disconnected by server");
            stopConversation();
          },
          onerror: (e) => {
            console.error(e);
            setError("Connection error");
            stopConversation();
          }
        }
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start conversation");
      stopConversation();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConversation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-4 md:p-8 space-y-8 items-center justify-center">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Live Conversation
        </h2>
        <p className="text-gray-400">Speak naturally with Gemini 2.5</p>
      </div>

      <div className="relative w-full max-w-2xl aspect-video bg-gray-900 rounded-3xl border border-gray-800 overflow-hidden shadow-2xl flex flex-col items-center justify-center">
        {/* Visualizer Canvas */}
        <canvas 
            ref={canvasRef} 
            width={800} 
            height={400} 
            className="absolute inset-0 w-full h-full opacity-50 pointer-events-none"
        />

        {/* Central Button */}
        <div className="z-10 relative">
            {!isConnected ? (
                <button 
                    onClick={startConversation}
                    className="group relative flex items-center justify-center w-24 h-24 rounded-full bg-gray-800 hover:bg-gray-700 border-2 border-cyan-500/50 hover:border-cyan-400 transition-all shadow-[0_0_30px_rgba(34,211,238,0.2)] hover:shadow-[0_0_50px_rgba(34,211,238,0.4)]"
                >
                    <svg className="w-10 h-10 text-cyan-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                </button>
            ) : (
                <button 
                    onClick={stopConversation}
                    className="group relative flex items-center justify-center w-24 h-24 rounded-full bg-red-900/20 hover:bg-red-900/40 border-2 border-red-500/50 hover:border-red-400 transition-all shadow-[0_0_30px_rgba(239,68,68,0.2)]"
                >
                    <div className="absolute inset-0 rounded-full border border-red-500/30 animate-ping"></div>
                    <svg className="w-10 h-10 text-red-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>

        {/* Status Text */}
        <div className="absolute bottom-8 z-10 font-mono text-sm">
            {isConnected ? (
                <span className={`px-3 py-1 rounded-full ${isSpeaking ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'} border border-white/10`}>
                    {isSpeaking ? 'Gemini is speaking...' : 'Listening...'}
                </span>
            ) : (
                <span className="text-gray-500">Ready to connect</span>
            )}
        </div>

        {/* Error Toast */}
        {error && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-900/90 text-red-100 px-4 py-2 rounded-lg text-sm border border-red-700">
                {error}
            </div>
        )}
      </div>

      <div className="w-full max-w-lg">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">System Logs</h3>
        <div className="bg-black/30 rounded-lg p-3 font-mono text-xs text-gray-400 h-24 overflow-y-auto border border-gray-800">
            {logs.length === 0 && <span className="opacity-50">Log output will appear here...</span>}
            {logs.map((log, i) => (
                <div key={i} className="border-b border-gray-800/50 last:border-0 py-1">{`> ${log}`}</div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default LiveConversation;