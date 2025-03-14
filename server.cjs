const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'calls.db'), (err) => {
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
    origin: "http://localhost:5173",
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
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(bodyParser.json());

// Get all calls
app.get('/calls', (req, res) => {
  db.all('SELECT * FROM calls ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching calls:', err);
      res.status(500).json({ error: 'Failed to fetch calls' });
      return;
    }

    // Format the data to match our application structure
    const calls = rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      transcript: row.transcript,
      caller: {
        name: row.caller_name,
        phone: row.caller_phone
      },
      sentiment: row.sentiment,
      summary: row.summary
    }));

    res.json(calls);
  });
});

const processedCalls = new Set();

// Webhook endpoint
app.post('/webhook', (req, res) => {
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
    callData.summary = call.summary;
    callData.caller = {
      name: 'Unknown Caller',
      phone: 'Unknown Number'
    };
    callData.transcript = call.shortSummary;

    processedCalls.add(call.callId); // Mark this call ID as processed

    // Save to database
    try {
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
        callData.summary
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
