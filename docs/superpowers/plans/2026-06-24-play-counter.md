# Play Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live play count (`◉ 1.321 BRAVE PILOTS HAVE PLAYED`) on the INSERT COIN screen, incrementing every time a player clicks INSERT COIN.

**Architecture:** A single-row Neon PostgreSQL table (`plays`) stores the counter, seeded at 1321. A new Vercel serverless function `api/plays.js` exposes GET (fetch count) and POST (atomic increment). The frontend fetches the count on page load and fires a fire-and-forget POST when the player dismisses the coin screen.

**Tech Stack:** Node.js (Vercel serverless), `@neondatabase/serverless`, Vanilla JS, HTML/CSS.

## Global Constraints

- Version bump: `index.html` footer must change from `v1.12.0` → `v1.13.0` (minor bump per CLAUDE.md — this is a new feature)
- Seed value: `1321` — initialized once via `ON CONFLICT DO NOTHING`
- POST is fire-and-forget: it must never block or break game start
- GET failure: `#play-count` stays hidden — no broken UI
- Follow patterns from `api/scores.js` exactly (CORS headers, error handling, env var names)

---

### Task 1: Add `plays` table to database schema

**Files:**
- Modify: `neon_schema.sql`

**Interfaces:**
- Produces: `public.plays` table with columns `id int PRIMARY KEY`, `count bigint` — used by `api/plays.js` in Task 2

- [ ] **Step 1: Add plays table SQL to neon_schema.sql**

Append the following block to the end of `neon_schema.sql`:

```sql
-- Play counter (single-row table, seeded at 1321 to reflect pre-existing plays)
CREATE TABLE IF NOT EXISTS public.plays (
  id    int PRIMARY KEY DEFAULT 1,
  count bigint NOT NULL DEFAULT 0,
  CHECK (id = 1)
);
INSERT INTO public.plays (id, count) VALUES (1, 1321)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Run migration in Neon Console**

Go to Neon Console → your project → SQL Editor. Paste and run the two statements above. Verify:

```sql
SELECT id, count FROM plays;
-- Expected: one row — id=1, count=1321
```

- [ ] **Step 3: Commit**

```bash
git add neon_schema.sql
git commit -m "feat: add plays counter table (seeded at 1321)"
```

---

### Task 2: Create `api/plays.js` serverless function

**Files:**
- Create: `api/plays.js`

**Interfaces:**
- Consumes: `public.plays` table from Task 1 (`SELECT count FROM plays WHERE id = 1`, `UPDATE plays SET count = count + 1 WHERE id = 1 RETURNING count`)
- Produces:
  - `GET /api/plays` → `{ count: number }`
  - `POST /api/plays` → `{ count: number }` (incremented value)

- [ ] **Step 1: Create api/plays.js**

Create `api/plays.js` with this exact content:

```javascript
// api/plays.js — Vercel serverless function (Node.js runtime)
// GET  /api/plays  → { count: N }
// POST /api/plays  → atomic increment, { count: N }

const { neon } = require('@neondatabase/serverless');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL missing');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const sql = neon(dbUrl);

  try {
    if (req.method === 'GET') {
      const [row] = await sql`SELECT count FROM plays WHERE id = 1`;
      return res.json({ count: row.count });
    }

    if (req.method === 'POST') {
      const [row] = await sql`
        UPDATE plays SET count = count + 1 WHERE id = 1 RETURNING count
      `;
      return res.json({ count: row.count });
    }

    res.status(405).end();
  } catch (err) {
    console.error('plays handler:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};
```

- [ ] **Step 2: Test GET endpoint after Vercel deploy**

After pushing to main (Vercel auto-deploys), run:

```bash
curl https://<your-domain>/api/plays
# Expected: {"count":1321}
```

- [ ] **Step 3: Test POST endpoint**

```bash
curl -X POST https://<your-domain>/api/plays
# Expected: {"count":1322}

curl https://<your-domain>/api/plays
# Expected: {"count":1322}
```

- [ ] **Step 4: Commit**

```bash
git add api/plays.js
git commit -m "feat: add /api/plays serverless endpoint (GET + POST)"
```

---

### Task 3: Frontend — display counter on INSERT COIN screen

**Files:**
- Modify: `index.html` (add `#play-count` div, bump version)
- Modify: `style.css` (add `.play-count` styles)
- Modify: `game.js` (wire up `ui.playCount`, `fetchPlayCount()`, POST in `dismissCoinScreen`)

**Interfaces:**
- Consumes: `GET /api/plays` → `{ count: number }` and `POST /api/plays` from Task 2
- Produces: `ui.playCount` DOM element with text `◉ 1.321 BRAVE PILOTS HAVE PLAYED`

- [ ] **Step 1: Add #play-count to index.html**

In `index.html`, find the `#coin-screen` div. After the `.coin-hint` div, add one new line:

```html
    <div class="coin-hint">TAP OR CLICK TO START</div>
    <div id="play-count" class="play-count hidden"></div>
```

Also bump the version in the `<div class="credit">` line:

```html
<div class="credit">© 2026 <a href="https://www.larssohl.dk" target="_blank" rel="noopener">larssohl.dk</a> · Built with Claude Code 2026 · v1.13.0</div>
```

- [ ] **Step 2: Add .play-count styles to style.css**

In `style.css`, find the `.coin-hint` rule block. Add the following rule directly after it:

```css
.play-count {
  font-family: 'VT323', monospace;
  font-size: 20px;
  color: var(--cyan);
  opacity: 0.7;
  letter-spacing: 2px;
  text-shadow: 0 0 8px var(--cyan);
}
```

- [ ] **Step 3: Add ui.playCount reference in game.js**

In `game.js`, find the `ui` object at the top. It ends with:

```javascript
  gameover: $('gameover'), finalScore: $('final-score'), finalWave: $('final-wave'),
  entry: $('entry'), initials: $('initials'), btnSubmit: $('btn-submit'),
  entryStatus: $('entry-status'), overBoard: $('over-board'), btnRestart: $('btn-restart'),
};
```

Change the last line of the `ui` object to add `playCount`:

```javascript
  gameover: $('gameover'), finalScore: $('final-score'), finalWave: $('final-wave'),
  entry: $('entry'), initials: $('initials'), btnSubmit: $('btn-submit'),
  entryStatus: $('entry-status'), overBoard: $('over-board'), btnRestart: $('btn-restart'),
  playCount: $('play-count'),
};
```

- [ ] **Step 4: Add fetchPlayCount function in game.js**

In `game.js`, find the `fetchScores` async function (near the leaderboard section). Add the new `fetchPlayCount` function directly before it:

```javascript
async function fetchPlayCount() {
  try {
    const res = await fetch('/api/plays');
    if (!res.ok) return;
    const { count } = await res.json();
    if (ui.playCount) {
      ui.playCount.textContent = '◉ ' + Number(count).toLocaleString() + ' BRAVE PILOTS HAVE PLAYED';
      ui.playCount.classList.remove('hidden');
    }
  } catch { /* fail silently */ }
}

async function fetchScores() {
```

- [ ] **Step 5: Fire POST in dismissCoinScreen**

In `game.js`, find the `dismissCoinScreen` function:

```javascript
function dismissCoinScreen() {
  if (!ui.coinScreen || ui.coinScreen.classList.contains('leaving')) return;
  Sfx.init(); Sfx.resume();
```

Add the fire-and-forget POST as the first line after the guard:

```javascript
function dismissCoinScreen() {
  if (!ui.coinScreen || ui.coinScreen.classList.contains('leaving')) return;
  fetch('/api/plays', { method: 'POST' }).catch(() => {});
  Sfx.init(); Sfx.resume();
```

- [ ] **Step 6: Call fetchPlayCount on init**

In `game.js`, find the init section at the bottom:

```javascript
ui.hiscore.textContent = hiscore.toLocaleString('en-US');
renderBoard(ui.menuBoard);
Music.init();
```

Add `fetchPlayCount()` between `renderBoard` and `Music.init()`:

```javascript
ui.hiscore.textContent = hiscore.toLocaleString('en-US');
renderBoard(ui.menuBoard);
fetchPlayCount();
Music.init();
```

- [ ] **Step 7: Verify in browser**

Open the deployed URL. The INSERT COIN screen should show `◉ 1.322 BRAVE PILOTS HAVE PLAYED` (or current count) in small cyan VT323 text below "TAP OR CLICK TO START". Click INSERT COIN — the count should increment by 1 on next page load.

- [ ] **Step 8: Commit**

```bash
git add index.html style.css game.js
git commit -m "feat: play counter on INSERT COIN screen (v1.13.0)"
```
