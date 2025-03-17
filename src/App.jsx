import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { format } from 'date-fns';
import { ChartBarIcon, ChatBubbleLeftIcon, ClockIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/outline';

// Components
const CallCard = ({ call, isSelected }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [audioError, setAudioError] = useState(null);
  const audioRef = useRef(null);

  const getSentimentColor = (sentiment) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'bg-emerald-100 text-emerald-800';
      case 'negative': return 'bg-rose-100 text-rose-800';
      default: return 'bg-amber-100 text-amber-800';
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
          <h4 className="font-medium text-slate-800">{title}</h4>
          <p className="text-slate-600 whitespace-pre-line">{content}</p>
        </div>
      );
    });
  };

  return (
    <div className={`${isSelected ? 'bg-white' : 'bg-white/50'} rounded-xl shadow-sm p-6 transition-all duration-200`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-slate-800">
              {call.caller?.name || 'Unknown Caller'}
            </h3>
            <span className="text-sm text-slate-500">
              {call.caller?.phone || 'No phone number'}
            </span>
            <span className={`px-2 py-1 rounded-full text-sm font-medium ${getSentimentColor(call.sentiment)}`}>
              {call.sentiment || 'neutral'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {new Date(call.timestamp).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-md font-semibold text-slate-800 mb-2">Summary</h3>
        <p className="text-slate-600">{call.summary}</p>
      </div>

      <div className="mt-6 space-y-6">
        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Transcript</h3>
          <p className="text-slate-600 whitespace-pre-line">{call.transcript}</p>
        </div>

        {call.agent_assessment && (
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Smart Insights</h3>
            <div className="bg-slate-50 p-4 rounded-lg">
              {formatAssessment(call.agent_assessment)}
            </div>
          </div>
        )}

        {call.recording_url && (
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">Recording</h3>
            <div className="flex items-center gap-4">
              <button
                onClick={audioError ? retryLoadAudio : togglePlayPause}
                disabled={isLoading}
                className={`flex items-center justify-center px-4 py-2 rounded-lg transition-all duration-200 ${
                  isLoading
                    ? 'bg-slate-200 cursor-not-allowed'
                    : audioError
                    ? 'bg-rose-500 hover:bg-rose-600'
                    : 'bg-indigo-500 hover:bg-indigo-600'
                } text-white`}
              >
                {isLoading ? (
                  <div className="w-5 h-5 relative">
                    <div className="w-full h-full rounded-full border-2 border-t-slate-200 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
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
              <div className="mt-2 text-rose-500 text-sm">
                {audioError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const CallListItem = ({ call, isSelected, onClick }) => {
  const getSentimentColor = (sentiment) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'text-emerald-500';
      case 'negative': return 'text-rose-500';
      default: return 'text-amber-500';
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`cursor-pointer p-4 ${isSelected ? 'bg-indigo-50 border border-indigo-500' : 'bg-slate-100 hover:bg-slate-200'} transition-all duration-200`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium text-slate-800">
            {call.caller?.name || 'Unknown Caller'}
          </h3>
          <p className="text-sm text-slate-500">
            {call.caller?.phone || 'No phone number'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {new Date(call.timestamp).toLocaleString()}
          </p>
        </div>
        <span className={`text-sm ${getSentimentColor(call.sentiment)}`}>
          {call.sentiment || 'neutral'}
        </span>
      </div>
      <p className="text-sm text-slate-600 mt-2 line-clamp-2">
        {call.summary}
      </p>
    </div>
  );
};


const App = () => {
  const [calls, setCalls] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isCallLoading, setIsCallLoading] = useState(false);

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
        if (data.length > 0) {
          setSelectedCall(data[0]);
        }
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

  const handleCallSelect = (call) => {
    setSelectedCall(call);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <ChatBubbleLeftIcon className="h-8 w-8 text-indigo-500" />
              <h1 className="text-xl font-bold text-slate-800">
                Jio Audiobot 2.0 - Call Transcript Viewer
              </h1>
            </div>
            <div className="text-sm text-slate-500">
              {calls.length} {calls.length === 1 ? 'call' : 'calls'} recorded
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-8 h-8 relative">
              <div className="w-full h-full rounded-full border-3 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            </div>
          </div>
        ) : error ? (
          <div className="m-8 bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-center space-x-3">
            <svg className="h-5 w-5 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-rose-700">{error}</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="m-8 bg-white rounded-lg shadow-sm p-8 text-center">
            <ChatBubbleLeftIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">
              No calls recorded yet
            </h3>
            <p className="text-slate-500">
              New calls will appear here as they are recorded
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-[calc(100vh-4rem)]">
            <div className="flex flex-1">
              {/* Left Panel - Call List */}
              <div className="w-1/3 border-r border-slate-200 overflow-y-auto">
                <div className="divide-y divide-slate-200">
                  {calls.map(call => (
                    <CallListItem 
                      key={call.id} 
                      call={call}
                      isSelected={selectedCall?.id === call.id}
                      onClick={() => handleCallSelect(call)}
                    />
                  ))}
                </div>
              </div>
              
              {/* Right Panel - Call Details */}
              <div className="w-2/3 overflow-y-auto p-8">
                {selectedCall && <CallCard call={selectedCall} isSelected={true} />}
              </div>
            </div>

            {/* Bottom Panel - Make Call */}
            <div className="border-t border-slate-200 bg-white p-4">
              <div className="max-w-lg mx-auto flex gap-4">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Enter phone number"
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={async () => {
                    if (!phoneNumber) return;
                    setIsCallLoading(true);
                    try {
                      const response = await fetch(`${baseUrl}/make-call`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ phoneNumber }),
                      });
                      
                      if (!response.ok) {
                        throw new Error('Failed to initiate call');
                      }
                      
                      const data = await response.json();
                      console.log('Call initiated:', data.callSid);
                    } catch (error) {
                      console.error('Error:', error.message);
                      setError('Failed to initiate call. Please try again.');
                    } finally {
                      setIsCallLoading(false);
                      setPhoneNumber('');
                    }
                  }}
                  disabled={isCallLoading || !phoneNumber}
                  className={`px-6 py-2 rounded-lg font-medium ${
                    isCallLoading || !phoneNumber
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                  }`}
                >
                  {isCallLoading ? (
                    <div className="w-5 h-5 relative">
                      <div className="w-full h-full rounded-full border-2 border-t-white border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    </div>
                  ) : (
                    'Make Call'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
