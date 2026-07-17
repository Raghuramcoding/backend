const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscore only' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, total_commits, refactor_points',
      [username, hash]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, total_commits, refactor_points FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

    await pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [user.id]);

    delete user.password_hash;
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Returns the logged-in user's current server-side state.
// The client calls this on load (after restoring the token) to pull
// the real commit count back down — this is what makes "log back in
// on another device/browser and get your commits back" work.
router.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, total_commits, refactor_points, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Client periodically pushes its authoritative commit/refactor totals here.
// We take the max of what the server has and what's submitted, so a stale
// client can't accidentally roll back progress made from another device.
router.post('/sync', requireAuth, async (req, res) => {
  const { totalCommits, refactorPoints } = req.body || {};
  const tc = Number(totalCommits);
  const rp = Number(refactorPoints);
  if (!Number.isFinite(tc) || !Number.isFinite(rp) || tc < 0 || rp < 0) {
    return res.status(400).json({ error: 'totalCommits and refactorPoints must be non-negative numbers' });
  }

  const result = await pool.query(
    `UPDATE users
     SET total_commits = GREATEST(total_commits, $2),
         refactor_points = GREATEST(refactor_points, $3),
         last_seen_at = now()
     WHERE id = $1
     RETURNING id, username, total_commits, refactor_points`,
    [req.userId, Math.floor(tc), Math.floor(rp)]
  );
  res.json({ user: result.rows[0] });
});

module.exports = router;
