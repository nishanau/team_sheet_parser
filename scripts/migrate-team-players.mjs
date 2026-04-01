/**
 * migrate-team-players.mjs
 *
 * Replaces the old game_players table with:
 *   - team_players       (one row per player per team, upserted across games)
 *   - game_players_fetched (tracks which game+team has been processed)
 *
 * Run: node scripts/migrate-team-players.mjs              (local only)
 * Run: node scripts/migrate-team-players.mjs --turso       (local + Turso)
 * Run: node scripts/migrate-team-players.mjs --turso-only  (Turso only)
 */
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import { resolve } from "path";

const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

const STATEMENTS = [
  "DROP TABLE IF EXISTS game_players",

  `CREATE TABLE IF NOT EXISTS team_players (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    team_name           TEXT NOT NULL,
    player_number       TEXT,
    first_name          TEXT NOT NULL,
    last_name           TEXT NOT NULL,
    profile_id          TEXT,
    last_seen_game_id   TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS game_players_fetched (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     TEXT NOT NULL,
    team_name   TEXT NOT NULL,
    fetched_at  TEXT NOT NULL
  )`,
];

const args      = process.argv.slice(2);
const tursoOnly = args.includes("--turso-only");
const withTurso = args.includes("--turso") || tursoOnly;

if (!tursoOnly) {
  const db = new Database(resolve("db/local.db"));
  db.pragma("journal_mode = WAL");
  for (const sql of STATEMENTS) db.exec(sql);
  db.close();
  console.log("✓ Migrated local db/local.db");
}

if (withTurso) {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  for (const sql of STATEMENTS) await client.execute(sql);
  console.log("✓ Migrated Turso");
}

console.log("Done.");
process.exit(0);
