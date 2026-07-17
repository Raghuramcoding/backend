# PROGRESS — commit-engine backend + frontend integration

## Done
- Full Node/Express backend for **Render** (Docker web service + managed Postgres, deployable via the included `render.yaml` Blueprint or manually): auth, friends/requests, DMs, races (competitions), teams. 23-case smoke suite passing (`npm test`, uses `pg-mem`).
- **`commit-engine.html` is now wired up to this API** (verified with a real jsdom + live-backend integration test, not just code review):
  - Login/register screen gates the game; session restores via `/auth/me` on reload using the stored JWT.
  - Local commit ticking stays instant/responsive; a background loop pushes `totalCommits`/`refactorPoints` to `/auth/sync` every 5s (confirmed the value actually lands server-side in testing).
  - The "Social" panel replaces the old local-only friends list with four tabs: **Friends** (username search, send/accept/decline requests, live leaderboard sourced from `/friends`), **Messages** (conversation list + thread view, `/messages`), **Races** (create/join a race-to-goal competition with live per-player progress bars, `/competitions`), **Teams** (create/join a team, contribute commits into the shared pool, `/teams`).
  - Logout clears the token and returns to the login screen.
- `API_BASE_URL` is a single constant near the top of the `<script>` block in `commit-engine.html` — currently `http://localhost:3000` for local testing. **Update this to the real Render URL (e.g. `https://commit-engine-backend.onrender.com`) after deploying the backend.**

## Not done yet (next session)
- **hacker-engine** hasn't been touched — it still needs the same auth/backend wiring. Also unresolved: should hacker-engine's "auto-hacks commit-engine's leaderboard every 60s" behavior now hit the real `/friends` leaderboard from this API, or stay as its own separate thing?
- No real-time push (WebSockets) — friends/leaderboard poll every 8s, races/teams refresh on tab-open/action. Fine for hobby scale; flag if you want push updates later.
- Once the backend is actually deployed to Render, do one manual smoke pass end-to-end against the real (non-`pg-mem`) Postgres instance — the test suite and the jsdom integration test both ran against an in-memory Postgres-compatible engine since no real Postgres was available in the sandbox.
- Free-tier Render specifics worth remembering: the web service spins down after 15 minutes idle (cold start on next request), and the free Postgres database expires at 90 days — see README for the upgrade/backup path before then.

## Key decisions made
- Postgres (not `node:sqlite`) — chosen because Render's container filesystem isn't guaranteed persistent across redeploys, and Render's managed Postgres wires in cleanly via `DATABASE_URL` (unlike Railway's Railpack issue that pushed you to `node:sqlite` before).
- JWT over server-side sessions — no session store needed, works cleanly across your static GitHub Pages frontend + separate backend origin.
- DMs restricted to accepted friends only (not open messaging) to avoid needing spam/abuse moderation for a hobby project.
- Sync uses `GREATEST()` merge instead of overwrite, specifically so a stale device can never erase real progress.
- Frontend keeps local ticking as the source of instant feedback and only periodically reconciles with the server, rather than making every click a network call — keeps the game feeling responsive even on a slow connection.

