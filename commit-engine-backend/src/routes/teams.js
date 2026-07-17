const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name || name.length < 3 || name.length > 30) {
    return res.status(400).json({ error: 'Team name must be 3-30 characters' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO teams (name, creator_id) VALUES ($1, $2) RETURNING id, name, pooled_commits`,
      [name, req.userId]
    );
    const team = result.rows[0];
    await pool.query(
      `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`,
      [team.id, req.userId]
    );
    res.status(201).json({ team });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Team name already taken' });
    console.error('create team error', err);
    res.status(500).json({ error: 'Could not create team' });
  }
});

router.post('/:id/join', async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await pool.query('SELECT id FROM teams WHERE id = $1', [teamId]);
  if (team.rows.length === 0) return res.status(404).json({ error: 'No such team' });
  try {
    await pool.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [teamId, req.userId]);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Already a member' });
    console.error('join team error', err);
    res.status(500).json({ error: 'Could not join team' });
  }
});

// Contribute some of your own commits into the shared team pool.
router.post('/:id/contribute', async (req, res) => {
  const teamId = Number(req.params.id);
  const amount = Math.floor(Number((req.body || {}).amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const membership = await pool.query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, req.userId]
  );
  if (membership.rows.length === 0) return res.status(403).json({ error: 'Not a member of this team' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE team_members SET contributed_commits = contributed_commits + $3
       WHERE team_id = $1 AND user_id = $2`,
      [teamId, req.userId, amount]
    );
    const teamResult = await client.query(
      `UPDATE teams SET pooled_commits = pooled_commits + $2 WHERE id = $1
       RETURNING id, name, pooled_commits`,
      [teamId, amount]
    );
    await client.query('COMMIT');
    res.json({ team: teamResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('contribute error', err);
    res.status(500).json({ error: 'Could not contribute' });
  } finally {
    client.release();
  }
});

router.get('/mine', async (req, res) => {
  const result = await pool.query(
    `SELECT t.id, t.name, t.pooled_commits, tm.contributed_commits
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id
     WHERE tm.user_id = $1`,
    [req.userId]
  );
  res.json({ teams: result.rows });
});

// Discover teams to join (not just your own).
router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT t.id, t.name, t.pooled_commits,
            COUNT(tm.user_id)::int AS member_count,
            BOOL_OR(tm.user_id = $1) AS joined
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id
     GROUP BY t.id, t.name, t.pooled_commits
     ORDER BY t.pooled_commits DESC
     LIMIT 30`,
    [req.userId]
  );
  res.json({ teams: result.rows.map(r => ({ ...r, joined: !!r.joined })) });
});

router.get('/:id', async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await pool.query('SELECT id, name, pooled_commits FROM teams WHERE id = $1', [teamId]);
  if (team.rows.length === 0) return res.status(404).json({ error: 'No such team' });

  const members = await pool.query(
    `SELECT u.username, tm.contributed_commits
     FROM team_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1 ORDER BY tm.contributed_commits DESC`,
    [teamId]
  );
  res.json({ team: team.rows[0], members: members.rows });
});

module.exports = router;
