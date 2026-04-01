// Seeds the leagues table with SFL and STJFL.
// SFL teams are populated by the cron sync (/api/cron/sync).
// STJFL teams are hardcoded in lib/constants.ts — no DB rows needed.
//
// Usage:
//   Local:  node scripts/seed-db.mjs
//   Turso:  node --env-file=.env.local scripts/seed-db.mjs
import { createClient } from "@libsql/client";

const url       = process.env.TURSO_DATABASE_URL ?? "file:db/local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db        = createClient(authToken ? { url, authToken } : { url });

console.log(`Target: ${url}\n`);

for (const name of ["SFL", "STJFL"]) {
  try {
    await db.execute({ sql: "INSERT OR IGNORE INTO leagues (name) VALUES (?)", args: [name] });
    console.log(`  inserted: ${name}`);
  } catch (err) {
    console.error(`  failed: ${name}:`, err.message);
  }
}

const rows = await db.execute("SELECT id, name FROM leagues ORDER BY name");
console.log("\nLeagues table:");
for (const r of rows.rows) console.log(`  id=${r.id}  name=${r.name}`);
console.log("\nDone. Run the cron sync next to populate teams and fixtures.");
