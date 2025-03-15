import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { format } from 'date-fns';
import { ChartBarIcon, ChatBubbleLeftIcon, ClockIcon } from '@heroicons/react/24/outline';

// Components
const CallCard = ({ call }) => {
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
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <ClockIcon className="h-4 w-4" />
          <time>{format(new Date(call.timestamp), 'PPpp')}</time>
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
