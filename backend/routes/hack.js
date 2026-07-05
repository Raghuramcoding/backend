const express = require("express");
const router = express.Router();
const db = require("../db");

const STEAL_PERCENT = 0.12; // successful hack steals 12% of target's commits
const COOLDOWN_MS = 60 * 1000; // 60s cooldown per hacker to prevent spam

const lastAttempt = new Map();

// POST /api/hack  { hacker, target, puzzleBonus }
// puzzleBonus: 0-1 float, how well they did on the mini-puzzle (0 = skipped/failed, 1 = perfect)
router.post("/", (req, res) => {
  const { hacker: hackerName, target: targetName, puzzleBonus = 0 } = req.body;

  if (!hackerName || !targetName) {
    return res.status(400).json({ error: "hacker and target required" });
  }
  if (hackerName === targetName) {
    return res.status(400).json({ error: "Cannot hack your own account" });
  }

  const now = Date.now();
  const last = lastAttempt.get(hackerName) || 0;
  if (now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    return res.status(429).json({ error: `Hack tools recharging. Wait ${wait}s.` });
  }

  const hacker = db.prepare("SELECT * FROM hackers WHERE username = ?").get(hackerName);
  const target = db.prepare("SELECT * FROM accounts WHERE username = ?").get(targetName);

  if (!hacker) return res.status(404).json({ error: "Hacker account not found" });
  if (!target) return res.status(404).json({ error: "Target account not found" });

  lastAttempt.set(hackerName, now);

  const clampedBonus = Math.max(0, Math.min(1, Number(puzzleBonus) || 0));

  // Base odds: idle tool power vs target defense
  const powerScore = hacker.power * (1 + clampedBonus); // puzzle performance boosts effective power
  const defenseScore = target.defense;
  const total = powerScore + defenseScore;
  const successChance = total > 0 ? powerScore / total : 0.5;

  const roll = Math.random();
  const success = roll < successChance;

  let stolen = 0;

  if (success) {
    stolen = Math.floor(target.commits * STEAL_PERCENT);
    db.prepare("UPDATE accounts SET commits = MAX(0, commits - ?), hack_count_against = hack_count_against + 1, updated_at = datetime('now') WHERE username = ?")
      .run(stolen, targetName);
    db.prepare("UPDATE hackers SET successful_hacks = successful_hacks + 1, total_stolen = total_stolen + ?, credits = credits + ?, updated_at = datetime('now') WHERE username = ?")
      .run(stolen, stolen, hackerName);
  } else {
    db.prepare("UPDATE hackers SET failed_hacks = failed_hacks + 1, updated_at = datetime('now') WHERE username = ?")
      .run(hackerName);
  }

  db.prepare("INSERT INTO hack_log (hacker, target, success, stolen) VALUES (?, ?, ?, ?)")
    .run(hackerName, targetName, success ? 1 : 0, stolen);

  res.json({
    success,
    stolen,
    successChance: Math.round(successChance * 100),
    roll: Math.round(roll * 100),
  });
});

// Recent hack log for a target (so commit-engine can show "you were hacked!")
router.get("/log/:username", (req, res) => {
  const rows = db
    .prepare("SELECT hacker, success, stolen, created_at FROM hack_log WHERE target = ? ORDER BY created_at DESC LIMIT 10")
    .all(req.params.username);
  res.json(rows);
});

module.exports = router;
