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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-200 hover:shadow-xl">
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-3">
            <ChatBubbleLeftIcon className="h-6 w-6 text-blue-500 dark:text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {call.caller.name}
              </h3>
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <ClockIcon className="h-4 w-4" />
                <span>{format(new Date(call.timestamp), 'MMM d, yyyy h:mm a')}</span>
              </div>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${sentimentColor}`}>
            {call.sentiment}
          </span>
        </div>

        {call.recording_url && (
          <div className="mt-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between space-x-4">
              <button
                onClick={togglePlayPause}
                disabled={!audioLoaded || isLoading}
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 ${
                  !audioLoaded || isLoading
                    ? 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transform hover:scale-105'
                } text-white`}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isLoading ? (
                  <div className="w-5 h-5 relative">
                    <div className="w-full h-full rounded-full border-2 border-t-blue-200 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                  </div>
                ) : isPlaying ? (
                  <PauseIcon className="h-5 w-5" />
                ) : (
                  <PlayIcon className="h-5 w-5 ml-0.5" />
                )}
              </button>

              <div className="flex-1 space-y-2">
                <div className="relative w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-100"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            {audioError && (
              <div className="mt-2 text-red-500 dark:text-red-400 text-sm flex items-center space-x-1">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{audioError}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center space-x-2 mb-2">
            <ChartBarIcon className="h-5 w-5 text-gray-400" />
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Summary</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
            {call.summary}
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2 mb-2">
            <ChatBubbleLeftIcon className="h-5 w-5 text-gray-400" />
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Transcript</h4>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {call.transcript}
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={audioUrl} preload="metadata" />
    </div>
  );
};

const App = () => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get base URL for API calls
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? 'https://jtxviewer.onrender.com'
    : 'http://localhost:3000';

  useEffect(() => {
    // Connect to WebSocket
    const socket = io(baseUrl);

    // Listen for new calls
    socket.on('newCall', (call) => {
      console.log('New call received:', call);
      setCalls(prevCalls => [call, ...prevCalls]);
    });

    // Fetch initial calls
    const fetchCalls = async () => {
      try {
        const response = await fetch(`${baseUrl}/calls`);
        if (!response.ok) {
          throw new Error('Failed to fetch calls');
        }
        const data = await response.json();
        setCalls(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching calls:', err);
        setError('Failed to load calls. Please refresh the page.');
        setLoading(false);
      }
    };

    fetchCalls();

    return () => socket.disconnect();
  }, [baseUrl]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <ChatBubbleLeftIcon className="h-8 w-8 text-blue-500" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Call Transcript Viewer
              </h1>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {calls.length} {calls.length === 1 ? 'call' : 'calls'} recorded
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-8 h-8 relative">
              <div className="w-full h-full rounded-full border-3 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center space-x-3">
            <svg className="h-5 w-5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
            <ChatBubbleLeftIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No calls recorded yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              New calls will appear here as they are recorded
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
            {calls.map(call => (
              <CallCard key={call.id} call={call} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
