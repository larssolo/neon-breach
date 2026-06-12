# NEON BREACH 🕹️

80'er synthwave arcade-shooter. Vanilla JS + Canvas — nul frontend-dependencies.
Leaderboard via [Neon.tech](https://neon.tech) Postgres, serveret via en Vercel serverless function.

## Gameplay

- **WASD / piletaster** — flyv frit · **Space (hold)** — skyd · **Shift** — OVERDRIVE
- **Mobil:** tilt for at flyve · hold finger = skyd · 2 fingre = OVERDRIVE
- **P** — pause · **M** — lyd til/fra
- **Graze:** flyv tæt forbi fjendeskud → bonus-points + overdrive-energi
- **OVERDRIVE:** 6 sek. uovervindelighed + 5-vejs skud + x2 score (kræver fuld meter)
- **Combo x8** (x16 med OD), 6 fjendetyper, koreograferede formationer, boss hver 5. wave

## Opsætning (ca. 10 min)

### 1. Neon database

1. Opret gratis projekt på [neon.tech](https://neon.tech)
2. Gå til **SQL Editor** og kør `neon_schema.sql`
3. Kopiér **Connection String** (Neon Console → Connection details)
   Format: `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`

### 2. Vercel deploy

```bash
# Installer Vercel CLI
npm i -g vercel

# Fra projektmappen:
npx vercel env add NEON_DATABASE_URL   # indsæt connection string, vælg alle environments
npx vercel env pull .env.local         # hent til lokal udvikling

# Test lokalt
npx vercel dev

# Deploy
npx vercel --prod
```

Vercel auto-detekterer `/api`-mappen og `package.json` — ingen `vercel.json` eller build-step nødvendigt.

### Alternativt: GitHub → Vercel

1. Push repo til GitHub
2. Importér i [vercel.com/new](https://vercel.com/new)
3. Tilføj `NEON_DATABASE_URL` under Environment Variables
4. Deploy

## Arkitektur

```
Browser
  │ fetch(/api/scores)
  ▼
Vercel serverless function (api/scores.js)
  │ @neondatabase/serverless over HTTPS
  ▼
Neon Postgres (scores-tabel)
```

Credentials ligger **kun** i Vercel env-variablen `NEON_DATABASE_URL` — aldrig i frontend-koden.
API-laget validerer al input server-side (navnelængde, score-range, wave-range).

## Filer

| Fil | Indhold |
|---|---|
| `index.html` | Skal, HUD, overlays |
| `style.css` | Synthwave/CRT-æstetik, mobil-layout |
| `game.js` | Hele spilmotoren (~900 linjer, nul dependencies) |
| `config.js` | API-URL (peger på `/api/scores`) |
| `api/scores.js` | Vercel serverless function → Neon |
| `package.json` | `@neondatabase/serverless` dependency |
| `neon_schema.sql` | Postgres-tabel til Neon SQL Editor |
