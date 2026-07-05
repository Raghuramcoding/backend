const express = require("express");
const router = express.Router();
const db = require("../db");

const USERNAME_RE = /^[a-zA-Z0-9_\-]{3,20}$/;

router.post("/", (req, res) => {
  const { username } = req.body;
  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "Username must be 3-20 chars, letters/numbers/_/- only" });
  }
  const existing = db.prepare("SELECT username FROM hackers WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "Username already taken" });
  }
  db.prepare(
    "INSERT INTO hackers (username, tools, power, successful_hacks, failed_hacks, total_stolen, credits, achievements) VALUES (?, '{}', 10, 0, 0, 0, 0, '{}')"
  ).run(username);
  const hacker = db.prepare("SELECT * FROM hackers WHERE username = ?").get(username);
  res.json(formatHacker(hacker));
});

router.get("/:username", (req, res) => {
  const hacker = db.prepare("SELECT * FROM hackers WHERE username = ?").get(req.params.username);
  if (!hacker) return res.status(404).json({ error: "Not found" });
  res.json(formatHacker(hacker));
});

router.patch("/:username", (req, res) => {
  const { username } = req.params;
  const existing = db.prepare("SELECT username FROM hackers WHERE username = ?").get(username);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { tools, power, credits, achievements } = req.body;
  const fields = [];
  const values = [];
  if (tools !== undefined) { fields.push("tools = ?"); values.push(JSON.stringify(tools)); }
  if (power !== undefined) { fields.push("power = ?"); values.push(Math.max(0, Math.floor(power))); }
  if (credits !== undefined) { fields.push("credits = ?"); values.push(Math.max(0, Math.floor(credits))); }
  if (achievements !== undefined) { fields.push("achievements = ?"); values.push(JSON.stringify(achievements)); }
  fields.push("updated_at = datetime('now')");

  if (fields.length === 1) return res.json(formatHacker(db.prepare("SELECT * FROM hackers WHERE username = ?").get(username)));

  values.push(username);
  db.prepare(`UPDATE hackers SET ${fields.join(", ")} WHERE username = ?`).run(...values);
  const hacker = db.prepare("SELECT * FROM hackers WHERE username = ?").get(username);
  res.json(formatHacker(hacker));
});

// Hacker leaderboard - ranked by successful hacks
router.get("/", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const rows = db
    .prepare("SELECT username, power, successful_hacks, failed_hacks, total_stolen FROM hackers ORDER BY successful_hacks DESC, total_stolen DESC LIMIT ?")
    .all(limit);
  res.json(rows);
});

function formatHacker(row) {
  if (!row) return null;
  return {
    ...row,
    tools: JSON.parse(row.tools || "{}"),
    achievements: JSON.parse(row.achievements || "{}"),
  };
}

module.exports = router;
