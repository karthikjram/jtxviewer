const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

// Ensure data directory exists
const dataDir = path.join("/", 'data');
if (!require('fs').existsSync(dataDir)) {
  require('fs').mkdirSync(dataDir);
}

// Initialize SQLite database with absolute path
const dbPath = path.join(dataDir, 'calls.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to SQLite database');
    // Create calls table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        transcript TEXT NOT NULL,
        caller_name TEXT NOT NULL,
        caller_phone TEXT NOT NULL,
        sentiment TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
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

app.use(cors({
  origin: 'https://jtxviewer.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(bodyParser.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Get all calls
app.get('/calls', (req, res) => {
  console.log('Fetching all calls from database...');
  db.all('SELECT * FROM calls ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching calls:', err);
      res.status(500).json({ error: 'Failed to fetch calls' });
      return;
    }

    console.log(`Found ${rows?.length || 0} calls in database`);
    
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
        summary: row.summary
      };
      console.log('Formatted call:', formattedCall);
      return formattedCall;
    });

    res.json(calls);
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

    const callData = {}
    callData.timestamp = new Date().toISOString();
    callData.id = call.callId || 'call_' + Date.now();
    callData.sentiment = "Neutral";
    
    // Extract caller name from transcript if available
    const nameMatch = call.shortSummary?.match(/My name is ([^.\n]+)/i);
    const callerName = nameMatch ? nameMatch[1].trim() : 'Unknown Caller';
    
    callData.caller = {
      name: callerName,
      phone: call.caller?.phoneNumber || 'Unknown Number'
    };
    
    // // Clean up and format the transcript
    // const cleanTranscript = call.shortSummary
    //   ?.replace('(New Call) Respond as if you are answering the phone.\n', '')
    //   ?.trim() || 'No transcript available';
    // callData.transcript = cleanTranscript;
    
    // // Generate a meaningful summary
    // const conversationLines = cleanTranscript.split('\n');
    // const summaryParts = [];
    
    // if (callerName !== 'Unknown Caller') {
    //   summaryParts.push(`Call with ${callerName}`);
    // }
    
    // // Add first exchange to summary
    // if (conversationLines.length >= 2) {
    //   const firstExchange = conversationLines.slice(0, 2).join(' → ');
    //   summaryParts.push(firstExchange);
    // }
    
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

    processedCalls.add(call.callId); // Mark this call ID as processed

    // Save to database
    try {
      console.log('Saving call to database:', callData);
      const stmt = db.prepare(`
        INSERT INTO calls (id, timestamp, transcript, caller_name, caller_phone, sentiment, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        callData.id,
        callData.timestamp,
        callData.transcript,
        callData.caller.name,
        callData.caller.phone,
        callData.sentiment,
        callData.summary,
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

// Simple sentiment analysis function (replace with actual NLP in production)
function analyzeSentiment(transcript) {
  const positiveWords = ['happy', 'great', 'excellent', 'good', 'thanks'];
  const negativeWords = ['bad', 'poor', 'terrible', 'unhappy', 'issue'];
  
  let score = 0;
  const words = transcript.toLowerCase().split(' ');
  
  words.forEach(word => {
    if (positiveWords.includes(word)) score++;
    if (negativeWords.includes(word)) score--;
  });
  
  return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
}

// Simple summary generation (replace with actual NLP in production)
function generateSummary(transcript) {
  return transcript.split(' ').slice(0, 20).join(' ') + '...';
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
