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
