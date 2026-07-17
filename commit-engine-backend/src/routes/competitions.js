const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Create a race: everyone who joins races from their current commit count
// up to `goal` more commits before `endsAt`.
router.post('/', async (req, res) => {
  const { name, goal, durationMinutes } = req.body || {};
  const g = Number(goal);
  const mins = Number(durationMinutes) || 60;
  if (!name || !Number.isFinite(g) || g <= 0) {
    return res.status(400).json({ error: 'name and a positive goal are required' });
  }

  const result = await pool.query(
    `INSERT INTO competitions (creator_id, name, goal, ends_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)
     RETURNING id, name, goal, starts_at, ends_at`,
    [req.userId, name, Math.floor(g), mins]
  );
  const comp = result.rows[0];

  const user = await pool.query('SELECT total_commits FROM users WHERE id = $1', [req.userId]);
  await pool.query(
    `INSERT INTO competition_participants (competition_id, user_id, starting_commits) VALUES ($1, $2, $3)`,
    [comp.id, req.userId, user.rows[0].total_commits]
  );

  res.status(201).json({ competition: comp });
});

router.post('/:id/join', async (req, res) => {
  const compId = Number(req.params.id);
  const comp = await pool.query('SELECT id, ends_at FROM competitions WHERE id = $1', [compId]);
  if (comp.rows.length === 0) return res.status(404).json({ error: 'No such competition' });
  if (new Date(comp.rows[0].ends_at) < new Date()) {
    return res.status(400).json({ error: 'This competition has already ended' });
  }

  const user = await pool.query('SELECT total_commits FROM users WHERE id = $1', [req.userId]);
  try {
    await pool.query(
      `INSERT INTO competition_participants (competition_id, user_id, starting_commits) VALUES ($1, $2, $3)`,
      [compId, req.userId, user.rows[0].total_commits]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Already joined' });
    console.error('join competition error', err);
    res.status(500).json({ error: 'Could not join competition' });
  }
});

// Live progress board for one competition.
router.get('/:id', async (req, res) => {
  const compId = Number(req.params.id);
  const comp = await pool.query('SELECT * FROM competitions WHERE id = $1', [compId]);
  if (comp.rows.length === 0) return res.status(404).json({ error: 'No such competition' });

  const participants = await pool.query(
    `SELECT u.username, cp.starting_commits, u.total_commits,
            (u.total_commits - cp.starting_commits) AS progress
     FROM competition_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.competition_id = $1
     ORDER BY progress DESC`,
    [compId]
  );

  res.json({ competition: comp.rows[0], participants: participants.rows });
});

// Competitions the caller is in or could join (recent + not ended).
router.get('/', async (req, res) => {
  const mine = await pool.query(
    `SELECT c.*, true AS joined FROM competitions c
     JOIN competition_participants cp ON cp.competition_id = c.id AND cp.user_id = $1
     WHERE c.ends_at > now() - interval '1 day'
     ORDER BY c.created_at DESC LIMIT 20`,
    [req.userId]
  );
  const open = await pool.query(
    `SELECT c.*, false AS joined FROM competitions c
     WHERE c.ends_at > now()
       AND c.id NOT IN (SELECT competition_id FROM competition_participants WHERE user_id = $1)
     ORDER BY c.created_at DESC LIMIT 20`,
    [req.userId]
  );
  res.json({ competitions: [...mine.rows, ...open.rows] });
});

module.exports = router;
