const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create a new database connection
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
              summary: row.summary
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
      const { id, timestamp, transcript, caller, sentiment, summary } = call;
      db.run(
        `INSERT INTO calls (id, timestamp, transcript, caller_name, caller_phone, sentiment, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, timestamp, transcript, caller.name, caller.phone, sentiment, summary],
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
