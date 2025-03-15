const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use Render's persistent volume if available, otherwise use local path
const dataDir = process.env.RENDER_VOLUME_PATH || path.join(__dirname, 'data');
if (!require('fs').existsSync(dataDir)) {
  require('fs').mkdirSync(dataDir, { recursive: true });
}

// Create a new database connection
const dbPath = path.join(dataDir, 'calls.db');
console.log('Using database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to SQLite database');
    // Drop and recreate table with updated schema
    db.serialize(() => {
      db.run('DROP TABLE IF EXISTS calls', (err) => {
        if (err) {
          console.error('Error dropping table:', err);
          return;
        }
        console.log('Dropped existing calls table');
      });

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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          return;
        }
        console.log('Created calls table with new schema');
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
