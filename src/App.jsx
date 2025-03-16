import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { format } from 'date-fns';
import { ChartBarIcon, ChatBubbleLeftIcon, ClockIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/outline';

// Components
const CallCard = ({ call }) => {
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [audioError, setAudioError] = useState(null);
  const audioRef = useRef(null);

  const getSentimentColor = (sentiment) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'bg-green-100 text-green-800';
      case 'negative': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;

      const handleLoadedMetadata = () => {
        setDuration(audio.duration);
        setIsLoading(false);
      };

      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };

      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      const handleError = (e) => {
        setAudioError('Error loading audio. Click to retry.');
        setIsLoading(false);
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);

      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
      };
    }
  }, []);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const retryLoadAudio = () => {
    setAudioError(null);
    setIsLoading(true);
    if (audioRef.current) {
      audioRef.current.load();
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatAssessment = (assessment) => {
    if (!assessment) return null;
    
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
              {call.caller?.name || 'Unknown Caller'}
            </h3>
            <span className="text-sm text-gray-500">
              {call.caller?.phone || 'No phone number'}
            </span>
            <span className={`px-2 py-1 rounded-full text-sm font-medium ${getSentimentColor(call.sentiment)}`}>
              {call.sentiment || 'neutral'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {new Date(call.timestamp).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-600 hover:text-blue-800"
        >
          {isExpanded ? 'Show Less' : 'Show More'}
        </button>
      </div>

      <div className="mt-4">
        <h3 className="text-md font-semibold text-gray-800 mb-2">Summary</h3>
        <p className="text-gray-600">{call.summary}</p>
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
                  className={`flex items-center justify-center px-4 py-2 rounded transition-all duration-200 ${
                    isLoading
                      ? 'bg-gray-200 cursor-not-allowed'
                      : audioError
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-blue-500 hover:bg-blue-600'
                  } text-white`}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 relative">
                      <div className="w-full h-full rounded-full border-2 border-t-blue-200 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    </div>
                  ) : audioError ? (
                    'Retry'
                  ) : isPlaying ? (
                    'Pause'
                  ) : (
                    'Play'
                  )}
                </button>
                <div className="flex-1">
                  <audio
                    ref={audioRef}
                    src={call.recording_url}
                    preload="metadata"
                    className="w-full"
                    controls
                  />
                </div>
              </div>

              {audioError && (
                <div className="mt-2 text-red-500 text-sm">
                  {audioError}
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
