/**
 * add-round-column.mjs
 * Adds the `round` column to the best_and_fairest table.
 * Runs against local SQLite and Turso production DB.
 * Run: node scripts/add-round-column.mjs
 */
import { createClient } from "@libsql/client";

const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

// SQLite doesn't support NOT NULL on ALTER without a DEFAULT, so we use a default
// of empty string for existing rows, then it acts as required at the app level.
const ALTER_SQL = `ALTER TABLE best_and_fairest ADD COLUMN round TEXT NOT NULL DEFAULT ''`;

async function run(label, client) {
  console.log(`\n🔧 ${label}`);
  try {
    await client.execute(ALTER_SQL);
    console.log("  ✓ Column 'round' added.");
  } catch (err) {
    if (err.message?.includes("duplicate column") || err.message?.includes("already exists")) {
      console.log("  ℹ Column 'round' already exists — skipping.");
    } else {
      console.error("  ✗ Error:", err.message);
    }
  }
}

const localDb = createClient({ url: "file:db/local.db" });
const tursoDb = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

await run("Local DB (db/local.db)", localDb);
await run("Turso production DB", tursoDb);

console.log("\n✅ Done.");
process.exit(0);
