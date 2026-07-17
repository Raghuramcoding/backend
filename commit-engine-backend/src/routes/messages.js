const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

async function friendshipExists(userA, userB) {
  const r = await pool.query(
    `SELECT 1 FROM friendships
     WHERE ((requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1))
       AND status = 'accepted'`,
    [userA, userB]
  );
  return r.rows.length > 0;
}

// Send a DM. Only allowed between accepted friends, to keep this from
// turning into an open messaging free-for-all.
router.post('/', async (req, res) => {
  const { toUsername, body } = req.body || {};
  if (!toUsername || !body || !body.trim()) {
    return res.status(400).json({ error: 'toUsername and body are required' });
  }
  if (body.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars)' });

  const target = await pool.query('SELECT id FROM users WHERE username = $1', [toUsername]);
  if (target.rows.length === 0) return res.status(404).json({ error: 'No such user' });
  const recipientId = target.rows[0].id;

  const areFriends = await friendshipExists(req.userId, recipientId);
  if (!areFriends) return res.status(403).json({ error: 'You can only message accepted friends' });

  const result = await pool.query(
    `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3)
     RETURNING id, sender_id, recipient_id, body, created_at`,
    [req.userId, recipientId, body.trim()]
  );
  res.status(201).json({ message: result.rows[0] });
});

// Full conversation thread with one friend.
router.get('/with/:username', async (req, res) => {
  const other = await pool.query('SELECT id FROM users WHERE username = $1', [req.params.username]);
  if (other.rows.length === 0) return res.status(404).json({ error: 'No such user' });
  const otherId = other.rows[0].id;

  const result = await pool.query(
    `SELECT id, sender_id, recipient_id, body, created_at, read_at
     FROM messages
     WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY created_at ASC
     LIMIT 200`,
    [req.userId, otherId]
  );

  await pool.query(
    `UPDATE messages SET read_at = now()
     WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [otherId, req.userId]
  );

  res.json({ messages: result.rows });
});

// Inbox summary: most recent message per conversation + unread counts.
router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT DISTINCT ON (other_id)
        other_id,
        u.username AS other_username,
        m.body AS last_body,
        m.created_at AS last_at,
        m.sender_id = $1 AS sent_by_me
     FROM (
       SELECT id, body, created_at, sender_id,
              CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id
       FROM messages
       WHERE sender_id = $1 OR recipient_id = $1
     ) m
     JOIN users u ON u.id = m.other_id
     ORDER BY other_id, m.created_at DESC`,
    [req.userId]
  );

  const unread = await pool.query(
    `SELECT sender_id, COUNT(*)::int AS count
     FROM messages WHERE recipient_id = $1 AND read_at IS NULL
     GROUP BY sender_id`,
    [req.userId]
  );
  const unreadMap = Object.fromEntries(unread.rows.map(r => [r.sender_id, r.count]));

  res.json({
    conversations: result.rows.map(r => ({
      username: r.other_username,
      lastMessage: r.last_body,
      lastAt: r.last_at,
      sentByMe: r.sent_by_me,
      unreadCount: unreadMap[r.other_id] || 0
    }))
  });
});

module.exports = router;
