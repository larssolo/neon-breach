// api/scores.js — Vercel serverless function (Node.js runtime)
// Neon DATABASE_URL opbevares KUN her som env-variabel, aldrig i frontend.
//
// Endpoints:
//   GET  /api/scores            → top-10 scores [ {name, score, wave} ]
//   GET  /api/scores?rank=12345 → { rank: N }   (din placering)
//   POST /api/scores            → gem ny score   body: {name, score, wave}

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
    /* -------- GET /api/scores -------- */
    if (req.method === 'GET') {
      const { rank } = req.query;

      if (rank !== undefined) {
        // Returnerer spillerens placering
        const sc = parseInt(rank, 10);
        if (!Number.isFinite(sc) || sc < 0) {
          return res.status(400).json({ error: 'Ugyldig score' });
        }
        const [row] = await sql`
          SELECT COUNT(*)::int AS cnt FROM scores WHERE score > ${sc}
        `;
        return res.json({ rank: row.cnt + 1 });
      }

      // Top-10 leaderboard
      const rows = await sql`
        SELECT name, score, wave
        FROM scores
        ORDER BY score DESC
        LIMIT 10
      `;
      return res.json(rows);
    }

    /* -------- POST /api/scores -------- */
    if (req.method === 'POST') {
      const body = req.body || {};
      const name = String(body.name || '')
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, '')
        .trim()
        .slice(0, 10);
      const score = Math.floor(Number(body.score));
      const wave  = Math.max(1, Math.floor(Number(body.wave)));

      if (!name || score <= 0 || score >= 10_000_000 || wave > 1000) {
        return res.status(400).json({ error: 'Invalid data' });
      }

      await sql`
        INSERT INTO scores (name, score, wave) VALUES (${name}, ${score}, ${wave})
      `;
      return res.status(201).end();
    }

    res.status(405).end();
  } catch (err) {
    console.error('scores handler:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};
