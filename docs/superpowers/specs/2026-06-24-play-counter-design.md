# Play Counter — Design Spec
**Date:** 2026-06-24

## Goal
Show a total play count on the INSERT COIN screen so visitors can see how popular the game is. The counter increments every time a player clicks INSERT COIN.

## What counts as a play
A click on the INSERT COIN button (`#press-start`). This captures all game starts, including players who quit early without submitting a score.

## Display
Below the existing `.coin-hint` ("TAP OR CLICK TO START"), add:

```
◉ 1.321 BRAVE PILOTS HAVE PLAYED
```

- Font: `VT323` (already loaded), small size, cyan neon color (`#00f6ff`) matching existing arcade aesthetic
- Number formatted with locale-appropriate thousands separator (`.` in Danish)
- Shown as soon as the count is fetched; hidden or omitted if the fetch fails

## Architecture

### Database — new `plays` table (Neon PostgreSQL)
Single-row counter table:

```sql
CREATE TABLE IF NOT EXISTS public.plays (
  id    int PRIMARY KEY DEFAULT 1,
  count bigint NOT NULL DEFAULT 0,
  CHECK (id = 1)
);
INSERT INTO public.plays (id, count) VALUES (1, 1321)
ON CONFLICT (id) DO NOTHING;
```

Initialized at **1321** to reflect pre-existing plays before the counter was added.

### Backend — new `api/plays.js` (Vercel serverless, Node.js)
Mirrors the pattern of `api/scores.js`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/plays | Returns `{ count: N }` |
| POST | /api/plays | Atomic increment, returns `{ count: N }` |

POST uses `UPDATE plays SET count = count + 1 WHERE id = 1 RETURNING count` — atomic, no race conditions.

### Frontend — `index.html` + `game.js`
1. **On page load**: `fetch('/api/plays')` → render count in new `#play-count` element inside `#coin-screen`
2. **On INSERT COIN click**: `fetch('/api/plays', { method: 'POST' })` — fire-and-forget, does not block game start
3. The POST happens once per click, before the coin screen animates away

## Error handling
- If GET fails: `#play-count` stays hidden (no broken UI)
- If POST fails: silently ignored (game still starts normally)

## SQL migration
Add to `neon_schema.sql` and run in Neon Console before deploying.

## Version bump
`index.html` footer: minor bump (v1.12.0 → v1.13.0) per CLAUDE.md rules.
