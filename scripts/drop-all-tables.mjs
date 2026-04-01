// Drops ALL tables in the target database. Data is permanently lost.
// Usage:
//   Local:  node scripts/drop-all-tables.mjs --local
//   Turso:  node --env-file=.env.local scripts/drop-all-tables.mjs
import { createClient } from "@libsql/client";

const isLocal = process.argv.includes("--local");
const url = isLocal ? "file:./db/local.db" : process.env.TURSO_DATABASE_URL;
const authToken = isLocal ? undefined : process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("ERROR: TURSO_DATABASE_URL not set. Run with: node --env-file=.env.local scripts/drop-all-tables.mjs");
  process.exit(1);
}

console.log(`Connecting to: ${url}\n`);
const client = createClient({ url, authToken });

const result = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
);
const tables = result.rows.map((r) => r.name);

if (tables.length === 0) {
  console.log("No tables found — database is already empty.");
  await client.close();
  process.exit(0);
}

console.log(`Found ${tables.length} table(s):\n`);
for (const t of tables) console.log(`  - ${t}`);
console.log();

for (const t of tables) {
  await client.execute(`DROP TABLE IF EXISTS \`${t}\``);
  console.log(`  dropped: ${t}`);
}

await client.close();
console.log("\nAll tables dropped. Run 'npm run db:migrate' to rebuild.");
