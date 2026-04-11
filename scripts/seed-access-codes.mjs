// Populates team_access_codes table from a JSON file.
// Drops all existing rows first, then inserts the new data.
//
// Usage:
//   Local:  node scripts/seed-access-codes.mjs path/to/team_access_codes.json
//   Turso:  node --env-file=.env.local scripts/seed-access-codes.mjs path/to/team_access_codes.json

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve } from "path";

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/seed-access-codes.mjs <path-to-json>");
  process.exit(1);
}

const url       = process.env.TURSO_DATABASE_URL ?? "file:db/local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db        = createClient(authToken ? { url, authToken } : { url });

console.log(`Target:     ${url}`);
console.log(`JSON file:  ${resolve(jsonPath)}\n`);

const records = JSON.parse(readFileSync(jsonPath, "utf8"));
if (!Array.isArray(records)) {
  console.error("JSON must be an array of access code objects.");
  process.exit(1);
}

// Drop all existing rows
await db.execute("DELETE FROM team_access_codes");
console.log("Cleared team_access_codes table.");

// Insert new rows
let inserted = 0;
let failed   = 0;

for (const r of records) {
  try {
    await db.execute({
      sql: `INSERT INTO team_access_codes (team_name, grade_name, code, active)
            VALUES (?, ?, ?, ?)`,
      args: [r.team_name, r.grade_name, r.code, r.active ?? 1],
    });
    inserted++;
  } catch (err) {
    console.error(`  FAILED [${r.code}] ${r.team_name}: ${err.message}`);
    failed++;
  }
}

console.log(`\nInserted: ${inserted}  Failed: ${failed}`);

const count = await db.execute("SELECT COUNT(*) AS n FROM team_access_codes");
console.log(`Rows in table: ${count.rows[0].n}`);
