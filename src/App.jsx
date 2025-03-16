import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { format } from 'date-fns';
import { ChartBarIcon, ChatBubbleLeftIcon, ClockIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/outline';

// Components
const CallCard = ({ call }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const audioRef = useRef(null);
  const maxRetries = 3;

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

  // Function to retry loading audio
  const retryLoadAudio = () => {
    if (retryCount >= maxRetries) {
      setAudioError('Maximum retry attempts reached. Please try again later.');
      return;
    }

    console.log(`Retrying audio load (attempt ${retryCount + 1}/${maxRetries})...`);
    setRetryCount(prev => prev + 1);
    setAudioError(null);
    setIsLoading(true);
    
    if (audioRef.current) {
      audioRef.current.load();
    }
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
        setRetryCount(0); // Reset retry count on successful load
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
          url: audioUrl,
          retryCount
        });

        let errorMessage = 'Failed to load audio recording.';
        if (e.target.error) {
          switch (e.target.error.code) {
            case e.target.error.MEDIA_ERR_ABORTED:
              errorMessage = 'Audio loading was aborted.';
              break;
            case e.target.error.MEDIA_ERR_NETWORK:
              errorMessage = 'Network error while loading audio.';
              break;
            case e.target.error.MEDIA_ERR_DECODE:
              errorMessage = 'Audio decoding error.';
              break;
            case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
              errorMessage = 'Audio format not supported.';
              break;
          }
        }

        setAudioError(`${errorMessage} ${retryCount < maxRetries ? 'Retrying...' : 'Please try again.'}`);
        setAudioLoaded(false);
        setIsPlaying(false);
        setIsLoading(false);

        if (retryCount < maxRetries) {
          setTimeout(retryLoadAudio, 2000); // Retry after 2 seconds
        }
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
        setRetryCount(0); // Reset retry count on successful load
      };
      const onAbort = () => {
        setAudioLoaded(false);
        setAudioError('Audio loading was aborted');
        setIsPlaying(false);
        setIsLoading(false);
      };
      const onStalled = () => {
        console.warn('Audio playback stalled:', {
          networkState: audio.networkState,
          readyState: audio.readyState,
          currentTime: audio.currentTime,
          url: audioUrl
        });
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
        setRetryCount(0); // Reset retry count on successful playback
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
      setRetryCount(0);

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

  // Get sentiment color based on value
  const getSentimentColor = (sentiment) => {
    switch(sentiment?.toLowerCase()) {
      case 'positive': return 'text-green-600';
      case 'negative': return 'text-red-600';
      default: return 'text-yellow-600';
    }
  };

  const formatAssessment = (assessment) => {
    if (!assessment) return null;
    
    // Split the assessment into sections
    const sections = assessment.split(/\d+\.\s+/).filter(Boolean);
    return sections.map((section, index) => {
      const title = section.split('\n')[0].trim();
      const content = section.split('\n').slice(1).join('\n').trim();
      return (
        <div key={index} className="mb-4">
          <h4 className="font-semibold text-gray-700">{title}</h4>
          <p className="text-gray-600 whitespace-pre-line">{content}</p>
        </div>
      );
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4 transition-all duration-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-800">
              {call.caller.name}
            </h3>
            <span className="text-sm text-gray-500">
              {call.caller.phone}
            </span>
            <span className={`px-2 py-1 rounded-full text-sm font-medium ${getSentimentColor(call.sentiment)}`}>
              {call.sentiment}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {format(new Date(call.timestamp), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-600 hover:text-blue-800"
        >
          {isExpanded ? 'Show Less' : 'Show More'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Transcript</h3>
            <p className="text-gray-600 whitespace-pre-line">{call.transcript}</p>
          </div>

          {call.agent_assessment && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Agent Performance Assessment</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                {formatAssessment(call.agent_assessment)}
              </div>
            </div>
          )}

          {call.recording_url && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Recording</h3>
              <div className="flex items-center gap-4">
                <button
                  onClick={audioError ? retryLoadAudio : togglePlayPause}
                  disabled={isLoading}
                  className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 ${
                    isLoading
                      ? 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
                      : audioError
                      ? 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 transform hover:scale-105'
                      : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transform hover:scale-105'
                  } text-white`}
                  aria-label={audioError ? 'Retry' : isPlaying ? 'Pause' : 'Play'}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 relative">
                      <div className="w-full h-full rounded-full border-2 border-t-blue-200 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    </div>
                  ) : audioError ? (
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
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
        </div>
      )}
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
                Jio Audiobot 2.0 - Call Transcript Viewer
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
