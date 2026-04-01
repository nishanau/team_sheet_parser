/**
 * Migration: add coaches_votes table
 * Usage:
 *   node scripts/add-coaches-vote.mjs            # local db/local.db
 *   node scripts/add-coaches-vote.mjs --turso    # local + Turso
 *   node scripts/add-coaches-vote.mjs --turso-only
 */
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

const SQL = `
CREATE TABLE IF NOT EXISTS coaches_votes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  grade              TEXT    NOT NULL,
  round              TEXT    NOT NULL,
  match_date         TEXT    NOT NULL,
  home_team          TEXT    NOT NULL,
  away_team          TEXT    NOT NULL,
  coach_team         TEXT    NOT NULL,
  player1_number     TEXT,
  player1_name       TEXT,
  player2_number     TEXT,
  player2_name       TEXT,
  player3_number     TEXT,
  player3_name       TEXT,
  player4_number     TEXT,
  player4_name       TEXT,
  player5_number     TEXT,
  player5_name       TEXT,
  submitter_name     TEXT    NOT NULL,
  signature_data_url TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;

async function run(label, client) {
  try {
    await client.execute(SQL);
    console.log(`✓ ${label}: coaches_votes table created (or already exists)`);
  } catch (err) {
    console.error(`✗ ${label}: ${err.message}`);
    process.exit(1);
  }
}

const args      = process.argv.slice(2);
const tursoOnly = args.includes("--turso-only");
const withTurso = args.includes("--turso") || tursoOnly;

if (!tursoOnly) {
  const dbPath = path.resolve(__dirname, "../db/local.db");
  const localDb = new Database(dbPath);
  localDb.exec(SQL);
  localDb.close();
  console.log("✓ Local db/local.db: coaches_votes table created (or already exists)");
}

if (withTurso) {
  const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  await run("Turso production DB", turso);
} else if (!tursoOnly) {
  console.log("\nℹ  Turso skipped — run with --turso to also migrate production.");
}
