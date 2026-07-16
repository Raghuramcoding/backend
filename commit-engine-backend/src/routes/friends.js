const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Search for a user by (partial) username, to add as a friend.
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json({ users: [] });
  const result = await pool.query(
    `SELECT id, username FROM users WHERE username ILIKE $1 AND id != $2 LIMIT 10`,
    [`%${q}%`, req.userId]
  );
  res.json({ users: result.rows });
});

// Send a friend request by username.
router.post('/request', async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username is required' });

  const target = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (target.rows.length === 0) return res.status(404).json({ error: 'No user with that username' });
  const recipientId = target.rows[0].id;
  if (recipientId === req.userId) return res.status(400).json({ error: "You can't friend yourself" });

  try {
    // If they already sent *you* a request, auto-accept instead of duplicating.
    const reverse = await pool.query(
      `SELECT id FROM friendships WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'`,
      [recipientId, req.userId]
    );
    if (reverse.rows.length > 0) {
      await pool.query(
        `UPDATE friendships SET status = 'accepted', responded_at = now() WHERE id = $1`,
        [reverse.rows[0].id]
      );
      return res.json({ status: 'accepted' });
    }

    await pool.query(
      `INSERT INTO friendships (requester_id, recipient_id, status) VALUES ($1, $2, 'pending')`,
      [req.userId, recipientId]
    );
    res.status(201).json({ status: 'pending' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Friend request already exists' });
    }
    console.error('friend request error', err);
    res.status(500).json({ error: 'Could not send friend request' });
  }
});

router.post('/respond', async (req, res) => {
  const { requesterUsername, accept } = req.body || {};
  if (!requesterUsername) return res.status(400).json({ error: 'requesterUsername is required' });

  const requester = await pool.query('SELECT id FROM users WHERE username = $1', [requesterUsername]);
  if (requester.rows.length === 0) return res.status(404).json({ error: 'No such user' });

  const newStatus = accept ? 'accepted' : 'blocked';
  const result = await pool.query(
    `UPDATE friendships SET status = $3, responded_at = now()
     WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'
     RETURNING id`,
    [requester.rows[0].id, req.userId, newStatus]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'No pending request from that user' });
  res.json({ status: newStatus });
});

router.delete('/:username', async (req, res) => {
  const other = await pool.query('SELECT id FROM users WHERE username = $1', [req.params.username]);
  if (other.rows.length === 0) return res.status(404).json({ error: 'No such user' });
  await pool.query(
    `DELETE FROM friendships
     WHERE (requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1)`,
    [req.userId, other.rows[0].id]
  );
  res.json({ ok: true });
});

// List accepted friends (with live commit totals — this is the "shared
// live leaderboard" data source) plus incoming/outgoing pending requests.
router.get('/', async (req, res) => {
  const accepted = await pool.query(
    `SELECT u.id, u.username, u.total_commits, u.refactor_points, u.last_seen_at
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.recipient_id ELSE f.requester_id END
     WHERE (f.requester_id = $1 OR f.recipient_id = $1) AND f.status = 'accepted'
     ORDER BY u.total_commits DESC`,
    [req.userId]
  );

  const incoming = await pool.query(
    `SELECT u.username FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.recipient_id = $1 AND f.status = 'pending'`,
    [req.userId]
  );

  const outgoing = await pool.query(
    `SELECT u.username FROM friendships f
     JOIN users u ON u.id = f.recipient_id
     WHERE f.requester_id = $1 AND f.status = 'pending'`,
    [req.userId]
  );

  res.json({
    friends: accepted.rows,
    incomingRequests: incoming.rows.map(r => r.username),
    outgoingRequests: outgoing.rows.map(r => r.username)
  });
});

module.exports = router;
