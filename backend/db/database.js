'use strict';

/**
 * database.js — SQLite setup for Wise County EMS Simulation backend
 *
 * Uses the 'sqlite3' npm package, which downloads a prebuilt binary via
 * node-pre-gyp. No Visual Studio Build Tools or native compilation required
 * for most Node.js versions on Windows x64.
 *
 * DB_PATH default: path.join(__dirname, 'ems_scenarios.db')
 *   __dirname resolves to backend/db/
 *   → DB file lives at backend/db/ems_scenarios.db  ✓
 *
 * DB_PATH environment variable overrides the default for Railway Volume mounts:
 *   Set DB_PATH=/app/db/ems_scenarios.db in Railway Variables after attaching a Volume.
 *
 * sqlite3 writes directly to the file on every statement — no manual export/save needed.
 *
 * All sqlite3 callbacks are wrapped in Promises and exported so that route
 * handlers can use clean async/await syntax without re-implementing wrappers.
 */

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

// Default: backend/db/ems_scenarios.db
// (__dirname = backend/db/, so path.join(__dirname, 'ems_scenarios.db') = backend/db/ems_scenarios.db)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ems_scenarios.db');

// Ensure the directory exists before opening the database file.
// recursive: true is safe even if the directory already exists.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Shared database instance — set by init()
let _db = null;

// ─── PROMISE HELPERS ──────────────────────────────────────────────────────────
// Exported so route handlers can use async/await without re-implementing wrappers.

/**
 * Runs a write statement (INSERT, UPDATE, DELETE).
 * Returns { lastID, changes } — lastID is the ROWID of the last INSERT.
 *
 * IMPORTANT: must use function() callback (not arrow function) so that
 * 'this.lastID' and 'this.changes' are accessible from the sqlite3 context.
 *
 * @param {string}  sql
 * @param {any[]}   params
 * @returns {Promise<{ lastID: number, changes: number }>}
 */
function dbRun(sql, params) {
  return new Promise((resolve, reject) => {
    _db.run(sql, params || [], function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Fetches a single row. Returns the row object, or undefined if not found.
 * Callers check `!row` to detect the not-found case.
 *
 * @param {string}  sql
 * @param {any[]}   params
 * @returns {Promise<object|undefined>}
 */
function dbGet(sql, params) {
  return new Promise((resolve, reject) => {
    _db.get(sql, params || [], (err, row) => {
      if (err) reject(err);
      else resolve(row);  // undefined when no row matches
    });
  });
}

/**
 * Fetches all matching rows as an array of objects.
 * Returns an empty array if no rows match.
 *
 * @param {string}  sql
 * @param {any[]}   params
 * @returns {Promise<object[]>}
 */
function dbAll(sql, params) {
  return new Promise((resolve, reject) => {
    _db.all(sql, params || [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

/**
 * Opens the SQLite database and creates tables if they don't exist.
 * Called once at server startup from server.js.
 *
 * Returns a Promise (server.js calls this without await, but the database
 * opens in milliseconds and is ready well before the first HTTP request).
 *
 * @returns {Promise<void>}
 */
async function init() {
  // Open (or create) the database file
  _db = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });

  // Create the scenarios table if it does not already exist
  await new Promise((resolve, reject) => {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT,
        params      TEXT NOT NULL,
        results     TEXT NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log('Database initialized at:', DB_PATH);
}

/**
 * Returns the shared sqlite3 Database instance.
 * @returns {import('sqlite3').Database}
 */
function getDb() {
  return _db;
}

module.exports = { init, getDb, dbRun, dbGet, dbAll };
