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
const twilio = require('twilio');
const https = require('https');

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
              agent_assessment TEXT,
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
  
  db.all(`
    SELECT id, timestamp, transcript, caller_name, caller_phone, sentiment, summary, recording_url, agent_assessment
    FROM calls 
    ORDER BY timestamp DESC
  `, [], async (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({
        error: 'Database query failed',
        details: err.message
      });
    }

    try {
      // Format each call record to match the expected structure
      const calls = rows.map(row => {
        const formattedCall = {
          id: row.id,
          timestamp: row.timestamp,
          transcript: row.transcript,
          caller: {
            name: row.caller_name,
            phone: row.caller_phone
          },
          sentiment: row.sentiment?.toLowerCase() || 'neutral',
          summary: row.summary,
          recording_url: row.recording_url,
          agent_assessment: row.agent_assessment
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

async function extractCustomerName(transcript) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Extract only the customer's full name from the provided conversation transcript. If the name is not mentioned or unclear, respond with 'Unknown Caller'. Return only the name or 'Unknown Caller', no other text."
        },
        {
          role: "user",
          content: transcript
        }
      ],
      temperature: 0,
      max_tokens: 20
    });

    const name = completion.choices[0].message.content.trim();
    return name === 'Unknown Caller' ? 'Unknown Caller' : name;
  } catch (error) {
    console.error('Error extracting customer name:', error);
    return 'Unknown Caller';
  }
}

async function assessAgentPerformance(transcript) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an expert customer experience analyst. Analyze the provided transcript between a customer and an AI support agent. Provide concise, customer-focused insights in the following categories:

IMPORTANT: Answer each category with 3-7 words ONLY. Do NOT explain your reasoning.


1. Sentiment Progression: [Improved/Deteriorated/Same]
2. Frustration Level: [High/Medium/Low]
3. Resolution Confidence: [High/Moderate/Low]
4. Escalation Needed: [Yes/No]
5. Repeat Contact Likelihood: [High/Moderate/Low]
6. Customer Intents: [Complaint/Query/Feedback/Support] can have multiple intents comma seperated
7. Key Issue: [Short phrase identifying core issue]
8. Suggested Next Step: [Short recommended follow-up action]
9. Tags: [Up to 5 comma-separated short tags regarding the call & topic]
10. Escalation Recommended: [Yes/No]
11. Proactive Opportunity: [Up-sell/Cross-sell/None]
12. Churn Risk: [High/Medium/Low]
13. Customer Satisfaction: [High/Moderate/Low]
14. NPS Prediction: [Promoter/Passive/Detractor]
15. Issue Complexity: [High/Medium/Low]

Be consistent, precise, and strictly concise.`
        },
        {
          role: "user",
          content: transcript
        }
      ],
      temperature: 0.4,
      max_tokens: 1000
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error assessing agent performance:', error);
    return 'Error generating agent assessment';
  }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const { event, call } = req.body;
  console.log('Webhook req.body:', req.body);
  
  if (event === 'call.ended') {
    console.log('Call ended:', call);

    // Check if this call ID has already been processed
    if (processedCalls.has(call.callId)) {
        console.log('Duplicate call event ignored:', call.callId);
        return res.sendStatus(200); // Early return for duplicates
    }

    const callData = {
      id: call.callId || 'call_' + Date.now(),
      timestamp: new Date().toISOString(),
      caller_name: 'Unknown Caller',
      caller_phone: call.caller?.phoneNumber || 'Unknown Number',
      sentiment: 'neutral',
      summary: call.shortSummary || 'Call transcript',
      agent_assessment: null,
      recording_url: process.env.NODE_ENV === 'production'
        ? `https://jtxviewer.onrender.com/calls/${call.callId}/recording`
        : `http://localhost:3000/calls/${call.callId}/recording`
    };
    
    // Fetch messages from Ultravox API to get transcript
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
      
      // Extract customer name from transcript using OpenAI
      if (callData.transcript !== 'No transcript available') {
        callData.caller_name = await extractCustomerName(callData.transcript);
        callData.sentiment = await analyzeSentiment(callData.transcript);
        callData.agent_assessment = await assessAgentPerformance(callData.transcript);
      }
      
    } catch (error) {
      console.error('Error fetching messages:', error);
      callData.transcript = 'Error fetching transcript';
    }

    processedCalls.add(call.callId); // Mark this call ID as processed

    // Save to database
    try {
      console.log('Saving call to database:', callData);
      const stmt = db.prepare(`
        INSERT INTO calls (id, timestamp, transcript, caller_name, caller_phone, sentiment, summary, agent_assessment, recording_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        callData.id,
        callData.timestamp,
        callData.transcript,
        callData.caller_name,
        callData.caller_phone,
        callData.sentiment,
        callData.summary,
        callData.agent_assessment,
        callData.recording_url,
        function(err) {
          if (err) {
            console.error('Error inserting call:', err);
            throw err;
          }
          console.log(`Call inserted successfully. Row ID: ${this.lastID}`);
        }
      );
      
      stmt.finalize();
      
      // Emit to all connected clients
      io.emit('newCall', {
        ...callData,
        caller: {
          name: callData.caller_name,
          phone: callData.caller_phone
        }
      });
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
          content: "You are a sentiment analysis expert. Analyze the following transcript and return ONLY one of these words: positive, neutral, or negative. Return only the word, no other text."
        },
        {
          role: "user",
          content: transcript
        }
      ],
      temperature: 0,
      max_tokens: 10
    });

    const sentiment = completion.choices[0].message.content.trim().toLowerCase();
    return ['positive', 'neutral', 'negative'].includes(sentiment) ? sentiment : 'neutral';
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    return 'neutral'; // Default to neutral on error
  }
}

// Simple summary generation (replace with actual NLP in production)
function generateSummary(transcript) {
  return transcript.split(' ').slice(0, 20).join(' ') + '...';
}

// Twilio configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Ultravox configuration
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;
const ULTRAVOX_API_URL = 'https://api.ultravox.ai/api/calls';  
const SYSTEM_PROMPT = 'Your name is Krishna, a customer relationship manager. You are an employee of Jio in India. You are calling a person on the phone for sales of Jio Products or issue followup. Ask them their name and see how they are doing. You have to answer all the questions they ask you in a patient and friendly manner. Keep your answers and conversations crisp, concise and to the point.';

// Format phone number to E.164 format
function formatPhoneNumber(phoneNumber) {
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  // For India numbers
  if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  
  // Add + prefix if not present
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
}

const ULTRAVOX_CALL_CONFIG = {
    systemPrompt: SYSTEM_PROMPT,
    model: 'fixie-ai/ultravox',
    voice: 'Krishna-Hindi-Urdu',
    temperature: 0.3,
    firstSpeaker: 'FIRST_SPEAKER_USER',
    medium: { twilio: {} },
    recordingEnabled: true
};

async function createUltravoxCall() {
    if (!ULTRAVOX_API_KEY) {
        throw new Error('Ultravox API Key is missing');
    }

    console.log('Creating Ultravox call with config:', {
        ...ULTRAVOX_CALL_CONFIG,
        systemPrompt: '(hidden)'
    });
    
    return new Promise((resolve, reject) => {
        const request = https.request(ULTRAVOX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ULTRAVOX_API_KEY
            }
        });

        let data = '';

        request.on('response', (response) => {
            console.log('Ultravox API response status:', response.statusCode);
            console.log('Ultravox API response headers:', response.headers);

            response.on('data', chunk => {
                data += chunk;
                console.log('Received chunk:', chunk.toString());
            });
            
            response.on('end', () => {
                console.log('Raw response data:', data);
                
                if (response.statusCode !== 200 && response.statusCode !== 201) {
                    console.error('Ultravox API error:', response.statusCode);
                    try {
                        const errorData = JSON.parse(data);
                        reject(new Error(`Ultravox API error: ${errorData.error || errorData.message || 'Unknown error'}`));
                    } catch (e) {
                        reject(new Error(`Ultravox API returned status ${response.statusCode}: ${data}`));
                    }
                    return;
                }
                
                try {
                    const parsedData = JSON.parse(data);
                    console.log('Ultravox response:', parsedData);
                    if (!parsedData.joinUrl) {
                        reject(new Error('No joinUrl in Ultravox response'));
                        return;
                    }
                    resolve(parsedData);
                } catch (error) {
                    console.error('Error parsing Ultravox response:', error);
                    console.error('Raw response:', data);
                    reject(error);
                }
            });
        });

        request.on('error', (error) => {
            console.error('Ultravox request error:', error);
            reject(error);
        });

        request.on('timeout', () => {
            console.error('Ultravox request timed out');
            request.destroy();
            reject(new Error('Request timed out'));
        });
        
        request.write(JSON.stringify(ULTRAVOX_CALL_CONFIG));
        request.end();
    });
}

// Make outbound call endpoint
app.post('/make-call', async (req, res) => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Check configurations
  if (!ULTRAVOX_API_KEY) {
    return res.status(500).json({ error: 'Ultravox API Key is missing' });
  }
  if (!TWILIO_ACCOUNT_SID) {
    return res.status(500).json({ error: 'Twilio Account SID is missing' });
  }
  if (!TWILIO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Twilio Auth Token is missing' });
  }
  if (!TWILIO_PHONE_NUMBER) {
    return res.status(500).json({ error: 'Twilio Phone Number is missing' });
  }

  try {
    console.log('Original phone number:', phoneNumber);
    const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
    console.log('Formatted phone number:', formattedPhoneNumber);

    console.log('Creating Ultravox call...');
    const ultravoxResponse = await createUltravoxCall();
    console.log('Full Ultravox response:', ultravoxResponse);
    
    if (!ultravoxResponse.joinUrl) {
      throw new Error('No joinUrl received from Ultravox');
    }
    console.log('Got joinUrl:', ultravoxResponse.joinUrl);

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('Twilio config:', {
      from: TWILIO_PHONE_NUMBER,
      to: formattedPhoneNumber
      // statusCallback: process.env.NODE_ENV === 'production' 
      //   ? 'https://jtxviewer.onrender.com/webhook'
      //   : 'http://localhost:3000/webhook'
    });

    const twiml = `<Response><Connect><Stream url="${ultravoxResponse.joinUrl}"/></Connect></Response>`;
    console.log('TwiML:', twiml);

    const call = await client.calls.create({
      twiml: twiml,
      to: formattedPhoneNumber,
      from: TWILIO_PHONE_NUMBER,
      // statusCallback: process.env.NODE_ENV === 'production' 
      //   ? 'https://jtxviewer.onrender.com/webhook'
      //   : 'http://localhost:3000/webhook'
      // statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      // statusCallbackMethod: 'POST'
    });

    console.log('Call initiated:', call.sid);
    console.log('Call status:', call.status);
    console.log('Full call response:', call);
    res.json({ 
      callSid: call.sid,
      status: call.status,
      to: formattedPhoneNumber,
      from: TWILIO_PHONE_NUMBER
    });
  } catch (error) {
    console.error('Detailed error:', error);
    console.error('Error stack:', error.stack);
    const errorMessage = error.message || 'Failed to initiate call';
    res.status(500).json({ error: errorMessage });
  }
});

// // Webhook endpoint for call status updates
// app.post('/webhook', (req, res) => {
//   const callStatus = req.body;
//   console.log('Call status update:', JSON.stringify(callStatus, null, 2));
//   res.sendStatus(200);
// });

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
