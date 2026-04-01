/**
 * add-game-players.mjs
 * Creates the game_players table in local.db and/or Turso.
 *
 * Run: node scripts/add-game-players.mjs              (local only)
 * Run: node scripts/add-game-players.mjs --turso       (local + Turso)
 * Run: node scripts/add-game-players.mjs --turso-only  (Turso only)
 */
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import { resolve } from "path";

const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

const DDL = `
  CREATE TABLE IF NOT EXISTS game_players (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL,
    team_name     TEXT NOT NULL,
    player_number TEXT,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    profile_id    TEXT
  )
`;

const args       = process.argv.slice(2);
const tursoOnly  = args.includes("--turso-only");
const withTurso  = args.includes("--turso") || tursoOnly;

if (!tursoOnly) {
  const db = new Database(resolve("db/local.db"));
  db.pragma("journal_mode = WAL");
  db.exec(DDL);
  db.close();
  console.log("✓ game_players table created in db/local.db");
}

if (withTurso) {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  await client.execute(DDL);
  console.log("✓ game_players table created in Turso");
}

console.log("Done.");
process.exit(0);
