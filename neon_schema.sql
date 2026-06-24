-- =====================================================
-- NEON BREACH — Neon.tech leaderboard-skema
-- Kør i Neon Console → SQL Editor (eller psql)
-- =====================================================

-- MIGRATION (run this if the table already exists):
-- ALTER TABLE public.scores DROP CONSTRAINT IF EXISTS scores_name_check;
-- ALTER TABLE public.scores ADD CONSTRAINT scores_name_check CHECK (char_length(name) BETWEEN 1 AND 10);

CREATE TABLE IF NOT EXISTS public.scores (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text    NOT NULL CHECK (char_length(name) BETWEEN 1 AND 10),
  score      integer NOT NULL CHECK (score > 0 AND score < 10000000),
  wave       integer NOT NULL DEFAULT 1 CHECK (wave BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indeks til hurtig top-10 og rank-forespørgsel
CREATE INDEX IF NOT EXISTS scores_score_idx ON public.scores (score DESC);

-- Bemærk: ingen RLS nødvendigt.
-- Validering sker server-side i /api/scores.js (Vercel serverless function).
-- Den eneste adgang til databasen er via NEON_DATABASE_URL i Vercel env.

-- Play counter (single-row table, seeded at 1321 to reflect pre-existing plays)
CREATE TABLE IF NOT EXISTS public.plays (
  id    int PRIMARY KEY DEFAULT 1,
  count bigint NOT NULL DEFAULT 0,
  CHECK (id = 1)
);
INSERT INTO public.plays (id, count) VALUES (1, 1321)
ON CONFLICT (id) DO NOTHING;
