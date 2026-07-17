// Lightweight smoke test using pg-mem (in-memory Postgres-compatible engine)
// to validate schema + route SQL without needing a real Postgres instance.
const { newDb } = require('pg-mem');
const request = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret';
process.env.CORS_ORIGIN = '';

const mem = newDb({ autoCreateForeignKeyIndices: true });
mem.public.registerFunction({
  name: 'now',
  returns: 'timestamptz',
  implementation: () => new Date(),
});

const { Pool } = mem.adapters.createPg();

// Monkeypatch db.js's pool by intercepting require cache
const dbModulePath = require.resolve('../src/db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { pool: new Pool() }
};

const { migrate } = require('../src/migrate');
const authRoutes = require('../src/routes/auth');
const friendRoutes = require('../src/routes/friends');
const messageRoutes = require('../src/routes/messages');
const competitionRoutes = require('../src/routes/competitions');
const teamRoutes = require('../src/routes/teams');

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/friends', friendRoutes);
app.use('/messages', messageRoutes);
app.use('/competitions', competitionRoutes);
app.use('/teams', teamRoutes);

function call(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = request.request({
      host: 'localhost', port: 3999, path, method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        data ? { 'Content-Length': Buffer.byteLength(data) } : {},
        token ? { Authorization: `Bearer ${token}` } : {}
      )
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(chunks); } catch (e) { parsed = chunks; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL:', msg); } else { console.log('ok:', msg); }
}

async function main() {
  await migrate();
  const server = app.listen(3999);

  // Register two users
  let r = await call('POST', '/auth/register', { username: 'alice_dev', password: 'password123' });
  assert(r.status === 201 && r.body.token, 'register alice');
  const aliceToken = r.body.token;

  r = await call('POST', '/auth/register', { username: 'bob_dev', password: 'password123' });
  assert(r.status === 201 && r.body.token, 'register bob');
  const bobToken = r.body.token;

  // Duplicate username rejected
  r = await call('POST', '/auth/register', { username: 'alice_dev', password: 'password123' });
  assert(r.status === 409, 'duplicate username rejected');

  // Login works
  r = await call('POST', '/auth/login', { username: 'alice_dev', password: 'password123' });
  assert(r.status === 200 && r.body.token, 'login alice');

  // Wrong password rejected
  r = await call('POST', '/auth/login', { username: 'alice_dev', password: 'wrong' });
  assert(r.status === 401, 'wrong password rejected');

  // Sync commits up, then /me reflects it (this is the "log back in and get commits back" path)
  r = await call('POST', '/auth/sync', { totalCommits: 5000, refactorPoints: 3 }, aliceToken);
  assert(r.status === 200 && r.body.user.total_commits == 5000, 'sync commits for alice');

  r = await call('GET', '/auth/me', null, aliceToken);
  assert(r.status === 200 && r.body.user.total_commits == 5000, 'me reflects synced commits');

  // Sync never rolls back (send lower value, should stay at max)
  r = await call('POST', '/auth/sync', { totalCommits: 100, refactorPoints: 0 }, aliceToken);
  assert(r.status === 200 && r.body.user.total_commits == 5000, 'sync does not roll back progress');

  // No auth -> 401
  r = await call('GET', '/auth/me', null, null);
  assert(r.status === 401, 'me requires auth');

  // Friend request flow
  r = await call('POST', '/friends/request', { username: 'bob_dev' }, aliceToken);
  assert(r.status === 201 && r.body.status === 'pending', 'alice sends friend request to bob');

  r = await call('GET', '/friends', null, bobToken);
  assert(r.body.incomingRequests.includes('alice_dev'), 'bob sees incoming request from alice');

  r = await call('POST', '/friends/respond', { requesterUsername: 'alice_dev', accept: true }, bobToken);
  assert(r.status === 200 && r.body.status === 'accepted', 'bob accepts alice');

  r = await call('GET', '/friends', null, aliceToken);
  assert(r.body.friends.some(f => f.username === 'bob_dev'), 'alice now has bob as friend');

  // DM only allowed between friends
  r = await call('POST', '/messages', { toUsername: 'bob_dev', body: 'hey bob!' }, aliceToken);
  assert(r.status === 201, 'alice can DM bob (friends)');

  r = await call('GET', '/messages/with/alice_dev', null, bobToken);
  assert(r.status === 200 && r.body.messages.length === 1, 'bob sees the message from alice');

  // register a stranger, DM should be blocked
  await call('POST', '/auth/register', { username: 'carol_dev', password: 'password123' });
  r = await call('POST', '/messages', { toUsername: 'carol_dev', body: 'hi' }, aliceToken);
  assert(r.status === 403, 'DM to non-friend is blocked');

  // Competitions
  r = await call('POST', '/competitions', { name: 'Weekend Race', goal: 100, durationMinutes: 60 }, aliceToken);
  assert(r.status === 201, 'alice creates a competition');
  const compId = r.body.competition.id;

  r = await call('POST', `/competitions/${compId}/join`, {}, bobToken);
  assert(r.status === 201, 'bob joins competition');

  r = await call('GET', `/competitions/${compId}`, null, aliceToken);
  assert(r.status === 200 && r.body.participants.length === 2, 'competition shows both participants');

  // Teams
  r = await call('POST', '/teams', { name: 'NightOwls' }, aliceToken);
  assert(r.status === 201, 'alice creates a team');
  const teamId = r.body.team.id;

  r = await call('POST', `/teams/${teamId}/join`, {}, bobToken);
  assert(r.status === 201, 'bob joins team');

  r = await call('POST', `/teams/${teamId}/contribute`, { amount: 250 }, bobToken);
  assert(r.status === 200 && r.body.team.pooled_commits == 250, 'bob contributes to team pool');

  r = await call('GET', `/teams/${teamId}`, null, aliceToken);
  assert(r.status === 200 && r.body.team.pooled_commits == 250, 'team pool reflects contribution');

  r = await call('GET', '/teams', null, aliceToken);
  assert(r.status === 200 && r.body.teams.some(t => t.name === 'NightOwls' && t.joined === true), 'team discovery lists NightOwls as joined for alice');

  server.close();
  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
