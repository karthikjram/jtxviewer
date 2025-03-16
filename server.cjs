const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Ensure data directory exists
// Use Render's persistent volume if available, otherwise use local path
const dataDir = process.env.RENDER_VOLUME_PATH || path.join(__dirname, 'data');
if (!require('fs').existsSync(dataDir)) {
  require('fs').mkdirSync(dataDir, { recursive: true });
  console.log('Created data directory:', dataDir);
}

// Initialize SQLite database with absolute path
const dbPath = path.join(dataDir, 'calls.db');
console.log('Using database path:', dbPath);

// Function to initialize database
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    console.log('Initializing database at:', dbPath);
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE, async (err) => {
      if (err) {
        console.error('Error connecting to database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      
      try {
        // Drop existing table if it exists
        await new Promise((resolve, reject) => {
          db.run('DROP TABLE IF EXISTS calls', (err) => {
            if (err) {
              console.error('Error dropping table:', err);
              reject(err);
              return;
            }
            console.log('Dropped existing calls table');
            resolve();
          });
        });

        // Create calls table with updated schema
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE calls (
              id TEXT PRIMARY KEY,
              timestamp TEXT NOT NULL,
              transcript TEXT NOT NULL,
              caller_name TEXT NOT NULL,
              caller_phone TEXT NOT NULL,
              sentiment TEXT NOT NULL,
              summary TEXT NOT NULL,
              recording_url TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(id)
            )
          `, (err) => {
            if (err) {
              console.error('Error creating table:', err);
              reject(err);
              return;
            }
            console.log('Created calls table with new schema');
            resolve();
          });
        });

        // Create index for faster queries
        await new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp DESC)`, (err) => {
            if (err) {
              console.error('Error creating index:', err);
              reject(err);
              return;
            }
            console.log('Created timestamp index');
            resolve();
          });
        });

        resolve(db);
      } catch (error) {
        console.error('Error during database initialization:', error);
        reject(error);
      }
    });
  });
}

// Initialize database
let db;
initializeDatabase()
  .then((database) => {
    db = database;
    console.log('Database setup complete');
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1); // Exit if we can't set up the database
  });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://jtxviewer.onrender.com",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Configure CORS middleware
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://jtxviewer.onrender.com']
    : ['http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization', 'Range']
};

// CORS pre-flight handler
app.options('*', cors(corsOptions));

// Apply CORS to all routes
app.use(cors(corsOptions));

// Validate API key middleware
const validateApiKey = (req, res, next) => {
  const apiKey = process.env.ULTRAVOX_API_KEY;
  if (!apiKey) {
    console.error('ULTRAVOX_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }
  req.apiKey = apiKey;
  next();
};

app.use(validateApiKey);

// Body parser middleware
app.use(bodyParser.json());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    env: process.env.NODE_ENV,
    dbPath: dbPath.replace(process.env.HOME || '', '~'),
    cors: {
      origin: corsOptions.origin,
      methods: corsOptions.methods,
      headers: corsOptions.allowedHeaders
    }
  });
});

// Get call recording with proper streaming
app.get('/calls/:callId/recording', async (req, res) => {
  const { callId } = req.params;
  console.log(`[Audio] Fetching recording for call: ${callId}`);
  
  try {
    // First check if the call exists in our database
    const call = await new Promise((resolve, reject) => {
      db.get('SELECT recording_url FROM calls WHERE id = ?', [callId], (err, row) => {
        if (err) {
          console.error('[Audio] Database error:', err);
          reject(err);
          return;
        }
        resolve(row);
      });
    });

    if (!call) {
      console.error(`[Audio] Call not found: ${callId}`);
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    const ultravoxUrl = `https://api.ultravox.ai/api/calls/${callId}/recording`;
    console.log('[Audio] Fetching from Ultravox URL:', ultravoxUrl);

    const options = {
      method: 'GET',
      headers: {
        'X-API-Key': req.apiKey,
        'Accept': 'audio/wav,audio/*;q=0.9,*/*;q=0.8',
        'User-Agent': 'JTXViewer/1.0'
      }
    };

    console.log('[Audio] Sending request with options:', {
      ...options,
      headers: {
        ...options.headers,
        'X-API-Key': '[REDACTED]'
      }
    });

    const response = await fetch(ultravoxUrl, options);
    
    console.log('[Audio] Ultravox response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Audio] Failed to fetch recording:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Failed to fetch recording: ${response.statusText}`);
    }

    // Set CORS headers based on request origin
    const origin = req.get('Origin');
    if (origin && corsOptions.origin.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    // Get content type and size
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    console.log('[Audio] Recording details:', {
      contentType,
      contentLength,
      status: response.status,
      origin,
      corsHeaders: {
        origin: res.getHeader('Access-Control-Allow-Origin'),
        methods: res.getHeader('Access-Control-Allow-Methods'),
        headers: res.getHeader('Access-Control-Allow-Headers'),
        credentials: res.getHeader('Access-Control-Allow-Credentials'),
        vary: res.getHeader('Vary')
      }
    });

    // Set audio headers
    res.setHeader('Content-Type', contentType || 'audio/wav');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Handle range requests
    const range = req.headers.range;
    if (range) {
      console.log('[Audio] Range request:', range);
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
      const chunksize = (end - start) + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLength}`);
      res.setHeader('Content-Length', chunksize);

      console.log('[Audio] Serving range:', {
        start,
        end,
        chunksize,
        totalSize: contentLength
      });
    }

    // Create a buffer to collect chunks
    const chunks = [];
    let totalSize = 0;

    // Handle streaming
    response.body.on('data', (chunk) => {
      chunks.push(chunk);
      totalSize += chunk.length;
      console.log(`[Audio] Received chunk: ${chunk.length} bytes, Total: ${totalSize} bytes`);
    });

    response.body.on('end', () => {
      console.log(`[Audio] Finished receiving data. Total size: ${totalSize} bytes`);
      const buffer = Buffer.concat(chunks);

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;
        res.end(buffer.slice(start, end + 1));
      } else {
        res.end(buffer);
      }
    });

    // Handle errors during streaming
    response.body.on('error', (error) => {
      console.error('[Audio] Error streaming audio:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming audio' });
      }
    });

    // Log when streaming is complete
    res.on('finish', () => {
      console.log(`[Audio] Finished streaming audio for call: ${callId}`);
    });

  } catch (error) {
    console.error('[Audio] Error fetching recording:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to fetch recording',
        message: error.message
      });
    }
  }
});

// Get all calls
app.get('/calls', (req, res) => {
  console.log('GET /calls - Request received');
  console.log('Database path:', dbPath);
  console.log('Database initialized:', !!db);

  // Check database initialization
  if (!db) {
    console.error('Database not initialized');
    res.status(503).json({
      error: 'Database not initialized',
      details: 'Server is still starting up. Please try again in a few seconds.'
    });
    return;
  }

  // Verify database file exists
  if (!require('fs').existsSync(dbPath)) {
    console.error('Database file does not exist at:', dbPath);
    res.status(500).json({
      error: 'Database file not found',
      details: 'The database file is missing. This might indicate a storage configuration issue.'
    });
    return;
  }

  // Query database
  db.all('SELECT * FROM calls ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({
        error: 'Database query failed',
        details: err.message
      });
      return;
    }

    console.log(`Found ${rows?.length || 0} calls in database`);
    
    try {
      // Format the data to match our application structure
      const calls = (rows || []).map(row => {
        const formattedCall = {
          id: row.id,
          timestamp: row.timestamp,
          transcript: row.transcript,
          caller: {
            name: row.caller_name,
            phone: row.caller_phone
          },
          sentiment: row.sentiment,
          summary: row.summary,
          recording_url: row.recording_url
        };
        return formattedCall;
      });

      // Log sample of response data
      if (calls.length > 0) {
        console.log('Sample call data:', JSON.stringify(calls[0], null, 2));
      }

      res.json(calls);
      console.log('GET /calls - Response sent successfully');
    } catch (formatError) {
      console.error('Error formatting call data:', formatError);
      res.status(500).json({
        error: 'Data formatting failed',
        details: formatError.message
      });
    }
  });
});

const processedCalls = new Set();

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const { event, call } = req.body;
  
  if (event === 'call.ended') {
    console.log('Call ended:', call);


    // Process the ended call data

    // Check if this call ID has already been processed
    if (processedCalls.has(call.callId)) {
        console.log('Duplicate call event ignored:', call.callId);
        return res.sendStatus(200); // Early return for duplicates
    }

    const callData = {
      timestamp: new Date().toISOString(),
      id: call.callId || 'call_' + Date.now(),
      sentiment: "Neutral",
      recording_url: process.env.NODE_ENV === 'production'
        ? `https://jtxviewer.onrender.com/calls/${call.callId}/recording`
        : `http://localhost:3000/calls/${call.callId}/recording`
    };
    
    // Extract caller name from transcript if available
    const nameMatch = call.shortSummary?.match(/My name is ([^.\n]+)/i);
    const callerName = nameMatch ? nameMatch[1].trim() : 'Unknown Caller';
    
    callData.caller = {
      name: callerName,
      phone: call.caller?.phoneNumber || 'Unknown Number'
    };
    
     
    callData.summary = call.shortSummary || 'Call transcript';
    
    // Fetch messages from Ultravox API
    try {
      const options = {
        method: 'GET',
        headers: {
          'X-API-Key': process.env.ULTRAVOX_API_KEY
        }
      };
      
      const response = await fetch(`https://api.ultravox.ai/api/calls/${callData.id}/messages`, options);
      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Fetched messages:', data);
      
      // Extract and combine all message texts
      const messageTexts = data.results
        .filter(msg => msg.text) // Only include messages that have text
        .map(msg => msg.text)
        .join('\n');
        
      callData.transcript = messageTexts || 'No transcript available';
    } catch (error) {
      console.error('Error fetching messages:', error);
      callData.transcript = 'Error fetching transcript';
    }

    // Analyze sentiment using OpenAI
    callData.sentiment = await analyzeSentiment(callData.transcript);

    processedCalls.add(call.callId); // Mark this call ID as processed

    // Save to database
    try {
      console.log('Saving call to database:', callData);
      const stmt = db.prepare(`
        INSERT INTO calls (id, timestamp, transcript, caller_name, caller_phone, sentiment, summary, recording_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        callData.id,
        callData.timestamp,
        callData.transcript,
        callData.caller.name,
        callData.caller.phone,
        callData.sentiment,
        callData.summary,
        callData.recording_url,
        function(err) { // Using function to get 'this' context
          if (err) {
            console.error('Error inserting call:', err);
            throw err;
          }
          console.log(`Call inserted successfully. Row ID: ${this.lastID}`);
        }
      );
      
      stmt.finalize();
      
      // Emit to all connected clients
      io.emit('newCall', callData);
      console.log('Emitted newCall event to all clients');
      
      res.status(200).json({ status: 'success' });
    } catch (err) {
      console.error('Error saving call:', err);
      res.status(500).json({ error: 'Failed to save call' });
    }

  } 
});

async function analyzeSentiment(transcript) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Perform sentiment analysis (positive, neutral, negative) on the given conversation transcript."
        },
        {
          role: "user",
          content: transcript
        }
      ],
      temperature: 0,
      max_tokens: 10
    });

    const score = completion.choices[0].message.content.trim();
    return score;
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    return 0; // Default to neutral on error
  }
}

// Simple summary generation (replace with actual NLP in production)
function generateSummary(transcript) {
  return transcript.split(' ').slice(0, 20).join(' ') + '...';
}

// Serve static files from the dist directory AFTER API routes
app.use(express.static(path.join(__dirname, 'dist')));

// Handle SPA routing - this should be the LAST route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
