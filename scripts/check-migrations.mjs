// Usage: node --env-file=.env.local scripts/check-migrations.mjs
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url === "file:./db/local.db") {
  console.error("ERROR: TURSO_DATABASE_URL is not set or is the local fallback.");
  console.error("Run with: node --env-file=.env.local scripts/check-migrations.mjs");
  process.exit(1);
}

console.log(`Connecting to: ${url}\n`);

const client = createClient({ url, authToken });

// Load the local journal to know what migrations exist
const journal = JSON.parse(
  readFileSync(join(__dirname, "../db/migrations/meta/_journal.json"), "utf8")
);

// Query drizzle's applied migrations table
let applied = [];
try {
  const result = await client.execute(
    "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at ASC"
  );
  applied = result.rows;
} catch (err) {
  if (err.message?.includes("no such table")) {
    console.log("__drizzle_migrations table does not exist — no migrations have been applied.\n");
  } else {
    console.error("Failed to query __drizzle_migrations:", err.message);
    process.exit(1);
  }
}

// Compare journal entries vs applied rows
console.log("=== Migration Status ===\n");
for (const entry of journal.entries) {
  const isApplied = applied.some((row) => String(row.id) === String(entry.idx));
  const status = isApplied ? "✓ applied" : "✗ MISSING";
  console.log(`  [${entry.idx}] ${entry.tag}  →  ${status}`);
}

const missingCount = journal.entries.filter(
  (e) => !applied.some((row) => String(row.id) === String(e.idx))
).length;

console.log(`\n${applied.length}/${journal.entries.length} migrations applied.`);

if (missingCount > 0) {
  console.log(`\n${missingCount} migration(s) not yet applied. Run: npm run db:migrate`);
} else {
  // Spot-check: verify a table from the latest migration exists
  console.log("\n=== Table Spot-Check ===\n");
  const tablesToCheck = [
    "leagues", "teams", "fixtures", "team_players",
    "game_players_fetched", "best_and_fairest", "coaches_votes", "team_access_codes",
  ];
  for (const table of tablesToCheck) {
    try {
      await client.execute(`SELECT 1 FROM ${table} LIMIT 1`);
      console.log(`  ✓ ${table}`);
    } catch {
      console.log(`  ✗ ${table}  ← MISSING`);
    }
  }
}

await client.close();
