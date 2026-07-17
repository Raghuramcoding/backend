# commit-engine-backend

Auth + friends + DMs + multiplayer (races and teams) for Commit Engine / Hacker Engine.
Node.js + Express + Postgres. Built for **Render**.

## Deploy to Render

### Option A — one-click Blueprint (easiest)
This repo includes a `render.yaml` that provisions everything at once.
1. Push this folder to a GitHub repo.
2. In the Render dashboard: **New → Blueprint**, connect the repo. Render reads `render.yaml` and creates both the web service and a free Postgres database, auto-wires `DATABASE_URL`, and generates a `JWT_SECRET` for you.
3. Edit the `CORS_ORIGIN` env var on the web service afterward to match your actual GitHub Pages URL(s) if different.
4. Deploy. Confirm it's alive: `GET https://<your-service>.onrender.com/health` → `{"ok":true}`

### Option B — manual setup
1. **New → PostgreSQL** — create a database (free tier is fine to start). Once it's up, copy its **Internal Database URL** from the Connections tab.
2. **New → Web Service** — connect this repo. Render detects the `Dockerfile` and builds a container (or choose the Node native runtime with build command `npm install` and start command `npm start` if you'd rather skip Docker).
3. Set environment variables on the web service:
   - `DATABASE_URL` — paste the Internal Database URL from step 1 (only works if the database and web service are in the **same region**)
   - `JWT_SECRET` — generate with `openssl rand -hex 32`
   - `CORS_ORIGIN` — comma-separated, e.g. `https://raghuramcoding.github.io`
   - (`PORT` is set automatically by Render — don't override it)
4. Deploy. On boot the app runs its own migration (`src/migrate.js`) automatically before starting the server, so the schema is created/updated on every deploy.

### Things to know about Render's free tier
- **Free web services spin down after 15 minutes of no traffic** and take ~30–60s to cold-start on the next request. Fine for a hobby project; if that cold start bothers you, Render's paid instance tiers stay warm.
- **Free Postgres databases expire after 90 days** (data is deleted). For anything you don't want to lose, either upgrade to a paid Postgres plan before day 90, or take a backup (`pg_dump` against the External Database URL) and restore into a fresh free database if you want to keep riding the free tier.

## Local development

```bash
npm install
cp .env.example .env   # fill in a local DATABASE_URL and JWT_SECRET
npm run migrate        # creates tables
npm start
```

## Tests

A smoke-test suite runs the full API against an in-memory Postgres-compatible engine (`pg-mem`), no real database needed:

```bash
npm install
npm test
```

## Auth model

Username + password (bcrypt-hashed). Login/register return a JWT (30-day expiry) that the client stores and sends as `Authorization: Bearer <token>`. `GET /auth/me` returns the server's current record for the logged-in user — this is what lets someone register on one device, then log in on another and get their real commit count back, instead of it being stuck in that device's localStorage.

`POST /auth/sync` is how the game periodically pushes its live commit/refactor totals up. It only ever raises the stored value (`GREATEST`), so a stale or offline client can never accidentally erase progress made elsewhere.

## API reference

All endpoints except `/health`, `/auth/register`, and `/auth/login` require `Authorization: Bearer <token>`.

### Auth
- `POST /auth/register` `{ username, password }` → `{ token, user }`
- `POST /auth/login` `{ username, password }` → `{ token, user }`
- `GET /auth/me` → `{ user }`
- `POST /auth/sync` `{ totalCommits, refactorPoints }` → `{ user }`

### Friends (the "contact each other" system)
- `GET /friends/search?q=` → `{ users: [{id, username}] }`
- `POST /friends/request` `{ username }` → send a request (auto-accepts if they'd already requested you)
- `POST /friends/respond` `{ requesterUsername, accept }` → accept or decline
- `DELETE /friends/:username` → remove a friend / cancel a request
- `GET /friends` → `{ friends: [...with live total_commits...], incomingRequests, outgoingRequests }`

### Messages (DMs — friends only)
- `POST /messages` `{ toUsername, body }`
- `GET /messages/with/:username` → full thread, marks incoming ones read
- `GET /messages` → inbox summary (last message + unread count per conversation)

### Competitions (race-to-a-goal multiplayer)
- `POST /competitions` `{ name, goal, durationMinutes }` → creates + auto-joins you
- `POST /competitions/:id/join`
- `GET /competitions/:id` → live progress board, sorted by progress
- `GET /competitions` → your competitions + open ones you could join

### Teams (co-op pooled commits)
- `POST /teams` `{ name }` → creates + auto-joins you
- `POST /teams/:id/join`
- `POST /teams/:id/contribute` `{ amount }` → moves some of your commits into the shared pool
- `GET /teams/mine`
- `GET /teams/:id` → pool total + per-member contributions

## Frontend

`commit-engine.html` is already wired up to this API (login/register, friend requests, DMs, races, teams — all working, verified with an integration test). The one thing you must do after deploying: open `commit-engine.html` and update the `API_BASE_URL` constant near the top of the `<script>` block from `http://localhost:3000` to your real Render URL (something like `https://commit-engine-backend.onrender.com`).

## Not yet done

The frontend (`commit-engine.html`) still needs a login/register panel and calls into this API for the friend list, DMs, races, and team panel — right now it only has the local-storage-only friend system from the previous pass. Say the word and I'll wire that up next; this backend is ready for it.
