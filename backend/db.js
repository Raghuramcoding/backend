const Database = require("better-sqlite3");
const path = require("path");

// Railway volumes persist at /data if you attach one; falls back to local file otherwise.
const dbPath = process.env.DB_PATH || path.join(__dirname, "data.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    username TEXT PRIMARY KEY,
    commits INTEGER DEFAULT 0,
    cps INTEGER DEFAULT 0,
    upgrades TEXT DEFAULT '{}',
    achievements TEXT DEFAULT '[]',
    defense INTEGER DEFAULT 10,
    hack_count_against INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS hackers (
    username TEXT PRIMARY KEY,
    tools TEXT DEFAULT '{}',
    power INTEGER DEFAULT 10,
    successful_hacks INTEGER DEFAULT 0,
    failed_hacks INTEGER DEFAULT 0,
    total_stolen INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS hack_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hacker TEXT,
    target TEXT,
    success INTEGER,
    stolen INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
