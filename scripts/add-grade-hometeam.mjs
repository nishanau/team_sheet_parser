/**
 * add-grade-hometeam.mjs
 * Adds `grade` and `home_team` columns to best_and_fairest.
 * Also renames teams.age_group -> teams.grade_name if needed.
 * Run: node scripts/add-grade-hometeam.mjs
 */
import { createClient } from "@libsql/client";

const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

const MIGRATIONS = [
  // best_and_fairest new columns
  `ALTER TABLE best_and_fairest ADD COLUMN grade TEXT`,
  `ALTER TABLE best_and_fairest ADD COLUMN home_team TEXT`,
  // teams: rename age_group -> grade_name (SQLite can't rename columns directly,
  // so we add the new column; old age_group stays but is ignored by Drizzle)
  `ALTER TABLE teams ADD COLUMN grade_name TEXT`,
  // fixtures table (synced from PlayHQ scraper)
  `CREATE TABLE IF NOT EXISTS fixtures (
    id           TEXT PRIMARY KEY,
    grade_name   TEXT NOT NULL,
    round_name   TEXT NOT NULL,
    match_date   TEXT NOT NULL,
    home_team_name TEXT NOT NULL,
    away_team_name TEXT NOT NULL,
    venue_name   TEXT
  )`,
];

async function run(label, client) {
  console.log(`\n🔧 ${label}`);
  for (const sql of MIGRATIONS) {
    try {
      await client.execute(sql);
      console.log(`  ✓ ${sql.slice(0, 70)}`);
    } catch (err) {
      if (
        err.message?.includes("duplicate column") ||
        err.message?.includes("already exists")
      ) {
        console.log(`  ℹ already exists — skipping: ${sql.slice(0, 60)}`);
      } else {
        console.error(`  ✗ ${err.message}`);
      }
    }
  }
}

const args     = process.argv.slice(2);
const tursoOnly = args.includes("--turso-only");
const withTurso = args.includes("--turso") || tursoOnly;

if (!tursoOnly) {
  const localDb = createClient({ url: "file:db/local.db" });
  await run("Local DB (db/local.db)", localDb);
}

if (withTurso) {
  const tursoDb = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  await run("Turso production DB", tursoDb);
} else if (!tursoOnly) {
  console.log("\nℹ  Turso skipped — run with --turso to also migrate production.");
}

console.log("\n✅ Migration done.");
process.exit(0);
