const express = require("express");
const router = express.Router();
const db = require("../db");

const USERNAME_RE = /^[a-zA-Z0-9_\-]{3,20}$/;

// Create account
router.post("/", (req, res) => {
  const { username } = req.body;
  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "Username must be 3-20 chars, letters/numbers/_/- only" });
  }
  const existing = db.prepare("SELECT username FROM accounts WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "Username already taken" });
  }
  db.prepare(
    "INSERT INTO accounts (username, commits, cps, upgrades, achievements, defense) VALUES (?, 0, 0, '{}', '[]', 10)"
  ).run(username);
  const account = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
  res.json(formatAccount(account));
});

// Get account
router.get("/:username", (req, res) => {
  const account = db.prepare("SELECT * FROM accounts WHERE username = ?").get(req.params.username);
  if (!account) return res.status(404).json({ error: "Not found" });
  res.json(formatAccount(account));
});

// Update account (sync progress)
router.patch("/:username", (req, res) => {
  const { username } = req.params;
  const existing = db.prepare("SELECT username FROM accounts WHERE username = ?").get(username);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { commits, cps, upgrades, achievements, defense } = req.body;
  const fields = [];
  const values = [];

  if (commits !== undefined) { fields.push("commits = ?"); values.push(Math.max(0, Math.floor(commits))); }
  if (cps !== undefined) { fields.push("cps = ?"); values.push(Math.max(0, Math.floor(cps))); }
  if (upgrades !== undefined) { fields.push("upgrades = ?"); values.push(JSON.stringify(upgrades)); }
  if (achievements !== undefined) { fields.push("achievements = ?"); values.push(JSON.stringify(achievements)); }
  if (defense !== undefined) { fields.push("defense = ?"); values.push(Math.max(0, Math.floor(defense))); }
  fields.push("updated_at = datetime('now')");

  if (fields.length === 1) return res.json(formatAccount(db.prepare("SELECT * FROM accounts WHERE username = ?").get(username)));

  values.push(username);
  db.prepare(`UPDATE accounts SET ${fields.join(", ")} WHERE username = ?`).run(...values);
  const account = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
  res.json(formatAccount(account));
});

// Leaderboard
router.get("/", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const rows = db
    .prepare("SELECT username, commits, cps, defense, hack_count_against FROM accounts ORDER BY commits DESC LIMIT ?")
    .all(limit);
  res.json(rows);
});

function formatAccount(row) {
  if (!row) return null;
  return {
    ...row,
    upgrades: JSON.parse(row.upgrades || "{}"),
    achievements: JSON.parse(row.achievements || "[]"),
  };
}

module.exports = router;
