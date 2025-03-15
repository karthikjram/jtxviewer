import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { format } from 'date-fns';
import { ChartBarIcon, ChatBubbleLeftIcon, ClockIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/outline';

// Components
const CallCard = ({ call }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);

  // Get base URL for API calls
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? 'https://jtxviewer.onrender.com'
    : 'http://localhost:3000';

  const audioUrl = call.recording_url?.startsWith('http') 
    ? call.recording_url 
    : `${baseUrl}${call.recording_url}`;

  // Format time in mm:ss
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Load audio when recording URL changes
  useEffect(() => {
    if (!audioUrl) {
      setAudioError('No recording URL available');
      return;
    }
    
    console.log('Loading audio from URL:', audioUrl);
    setIsLoading(true);
    setAudioError(null);

    if (audioRef.current) {
      const audio = audioRef.current;

      const onTimeUpdate = () => setCurrentTime(audio.currentTime);
      const onLoadedMetadata = () => {
        setDuration(audio.duration);
        setAudioLoaded(true);
        setIsLoading(false);
        setAudioError(null);
      };
      const onEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      const onError = (e) => {
        console.error('Audio error:', e);
        console.error('Audio error details:', {
          error: e.target.error,
          networkState: e.target.networkState,
          readyState: e.target.readyState,
          url: audioUrl
        });
        setAudioError('Failed to load audio recording. Please try again.');
        setAudioLoaded(false);
        setIsPlaying(false);
        setIsLoading(false);
      };
      const onLoadStart = () => {
        setAudioLoaded(false);
        setAudioError(null);
        setIsLoading(true);
      };
      const onCanPlayThrough = () => {
        setAudioLoaded(true);
        setAudioError(null);
        setIsLoading(false);
      };
      const onAbort = () => {
        setAudioLoaded(false);
        setAudioError('Audio loading was aborted');
        setIsPlaying(false);
        setIsLoading(false);
      };
      const onStalled = () => {
        setAudioError('Audio playback stalled. Please try again.');
        setIsPlaying(false);
        setIsLoading(false);
      };
      const onWaiting = () => {
        setAudioLoaded(false);
        setIsLoading(true);
      };
      const onPlaying = () => {
        setAudioLoaded(true);
        setAudioError(null);
        setIsLoading(false);
      };

      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      audio.addEventListener('loadstart', onLoadStart);
      audio.addEventListener('canplaythrough', onCanPlayThrough);
      audio.addEventListener('abort', onAbort);
      audio.addEventListener('stalled', onStalled);
      audio.addEventListener('waiting', onWaiting);
      audio.addEventListener('playing', onPlaying);

      // Reset state when URL changes
      setAudioLoaded(false);
      setAudioError(null);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setIsLoading(true);

      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('loadstart', onLoadStart);
        audio.removeEventListener('canplaythrough', onCanPlayThrough);
        audio.removeEventListener('abort', onAbort);
        audio.removeEventListener('stalled', onStalled);
        audio.removeEventListener('waiting', onWaiting);
        audio.removeEventListener('playing', onPlaying);
      };
    }
  }, [audioUrl]);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
          setAudioError('Failed to play audio. Please try again.');
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const sentimentColor = {
    positive: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    negative: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }[call.sentiment];

  return (
    <div className="card mb-4">
      <div className="card-header flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <ChatBubbleLeftIcon className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-semibold">Call Transcript</h3>
        </div>
        <div className="flex items-center space-x-4">
          {audioError ? (
            <div className="text-red-500 dark:text-red-400 text-sm mb-2">
              {audioError}
            </div>
          ) : null}
          {call.recording_url && (
            <>
              <div className="flex items-center space-x-4">
                <button
                  onClick={togglePlayPause}
                  disabled={!audioLoaded || isLoading}
                  className={`p-2 rounded-full ${
                    !audioLoaded || isLoading
                      ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700'
                  } text-white`}
                >
                  {isLoading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : isPlaying ? (
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
                <div className="flex-1">
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                    <div
                      className="h-2 bg-blue-500 dark:bg-blue-600 rounded-full"
                      style={{
                        width: `${(currentTime / duration) * 100 || 0}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>
              <audio 
                ref={audioRef} 
                preload="metadata"
                crossOrigin="anonymous"
              >
                <source 
                  src={audioUrl}
                  type="audio/wav"
                />
                Your browser does not support the audio element.
              </audio>
            </>
          )}
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <ClockIcon className="h-4 w-4" />
            <time>{format(new Date(call.timestamp), 'PPpp')}</time>
          </div>
        </div>

      </div>
      
      <div className="caller-info px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-b dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
            <span className="font-medium text-gray-700 dark:text-gray-300">{call.caller.name}</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            <span className="text-sm text-gray-600 dark:text-gray-400">{call.caller.phone}</span>
          </div>
        </div>
      </div>
      
      <div className="card-body">
        <div className="mb-4">
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {call.transcript}
          </p>
        </div>

        <div className="border-t dark:border-gray-700 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Sentiment Analysis
              </h4>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sentimentColor}`}>
                {call.sentiment.charAt(0).toUpperCase() + call.sentiment.slice(1)}
              </span>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Summary
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {call.summary}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function fetchCalls() {
      try {
        console.log('Fetching existing calls...');
        const response = await fetch('https://jtxviewer.onrender.com/calls');
        if (!response.ok) throw new Error('Failed to fetch calls');
        const data = await response.json();
        console.log('Received calls:', data);
        setCalls(data);
      } catch (err) {
        console.error('Error fetching calls:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchCalls();

    // Connect to WebSocket
    console.log('Connecting to WebSocket...');
    const socket = io('https://jtxviewer.onrender.com', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      autoConnect: true,
      forceNew: false,
      timeout: 10000,
      withCredentials: true
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnected(false);
      // Don't set error state here to prevent UI disruption
      // It will retry automatically
    });
    
    socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`WebSocket reconnection attempt ${attempt}`);
    });
    
    socket.io.on('reconnect', () => {
      console.log('WebSocket reconnected successfully');
      setConnected(true);
      setError(null);
    });
    
    socket.io.on('reconnect_error', (error) => {
      console.error('WebSocket reconnection error:', error);
      // Only set error after multiple failed attempts
      if (socket.io.reconnectionAttempts > 8) {
        setError('Failed to connect to WebSocket server after multiple attempts');
      }
    });
    
    socket.on('newCall', (newCall) => {
      console.log('Received new call:', newCall);
      setCalls(prevCalls => [newCall, ...prevCalls]);
    });

    return () => {
      console.log('Cleaning up...');
      socket.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error && !calls.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Jio Voicebot 2.0 - Call transcripts
          </h1>
          <ChartBarIcon className="h-6 w-6 text-primary-600" />
        </div>

        <div className="space-y-4">
          {calls.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                No calls received yet. Waiting for incoming calls...
              </p>
            </div>
          ) : (
            calls.map((call, index) => (
              <CallCard key={call.timestamp + index} call={call} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
