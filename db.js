const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Determine database path based on environment
const dataDir = process.env.RENDER_VOLUME_PATH || path.join(__dirname, 'data');

// Ensure data directory exists
try {
  require('fs').mkdirSync(dataDir, { recursive: true });
  console.log('Data directory ensured at:', dataDir);
} catch (err) {
  console.error('Error creating data directory:', err);
  throw err;
}

// Set database path
const dbPath = path.join(dataDir, 'calls.db');
console.log('Using database path:', dbPath);

// Create database connection with proper error handling
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to SQLite database');
    
    // Initialize database schema with proper error handling
    db.serialize(() => {
      // Drop existing table
      db.run('DROP TABLE IF EXISTS calls', (err) => {
        if (err) {
          console.error('Error dropping table:', err);
          throw err; // Throw error to stop initialization
        }
        console.log('Dropped existing calls table');
      });

      // Create table with updated schema
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
          throw err; // Throw error to stop initialization
        }
        console.log('Created calls table with new schema');
      });

      // Create index for faster queries
      db.run(`CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp DESC)`, (err) => {
        if (err) {
          console.error('Error creating index:', err);
          throw err;
        }
        console.log('Created timestamp index');
      });
    });
  }
});

// Database operations
const dbOperations = {
  // Get all calls ordered by timestamp (newest first)
  getAllCalls: () => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM calls ORDER BY timestamp DESC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Format the rows to match our application structure
            const calls = rows.map(row => ({
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
            }));
            resolve(calls);
          }
        }
      );
    });
  },

  // Save a new call
  saveCall: (call) => {
    return new Promise((resolve, reject) => {
      const { id, timestamp, transcript, caller, sentiment, summary, recording_url } = call;
      db.run(
        `INSERT INTO calls (id, timestamp, transcript, caller_name, caller_phone, sentiment, summary, recording_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, timestamp, transcript, caller.name, caller.phone, sentiment, summary, recording_url],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(call);
          }
        }
      );
    });
  }
};

module.exports = dbOperations;
