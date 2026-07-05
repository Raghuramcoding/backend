const { DatabaseSync } = require("node:sqlite");
const path = require("path");

// Railway volumes persist at /data if you attach one; falls back to local file otherwise.
const dbPath = process.env.DB_PATH || path.join(__dirname, "data.db");
const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL;");

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
    credits INTEGER DEFAULT 0,
    achievements TEXT DEFAULT '{}',
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

// Migration: add columns that may not exist on databases created before this update.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn("hackers", "achievements", "TEXT DEFAULT '{}'");
ensureColumn("hackers", "credits", "INTEGER DEFAULT 0");

module.exports = db;
