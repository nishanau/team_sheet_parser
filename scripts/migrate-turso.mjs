/**
 * migrate-turso.mjs
 * Applies schema migrations and seeds league/team data to the Turso production DB.
 * Run once: node scripts/migrate-turso.mjs
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve } from "path";

const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// ─── Schema migration ─────────────────────────────────────────────────────────
async function migrate() {
  console.log("📦 Applying schema...");

  // Find the migration file (there's only one)
  const sqlFile = resolve("db/migrations/0000_redundant_silk_fever.sql");
  const sql = readFileSync(sqlFile, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map(s => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await db.execute(stmt);
      console.log("  ✓", stmt.slice(0, 60).replace(/\n/g, " ").trim() + "…");
    } catch (err) {
      if (err.message?.includes("already exists")) {
        console.log("  ⚠ skipped (already exists):", stmt.slice(0, 50).replace(/\n/g, " ").trim());
      } else {
        console.error("  ✗", err.message);
      }
    }
  }
}

// ─── Seed data ────────────────────────────────────────────────────────────────
const sflTeams = [
  "Brighton", "Clarence", "Claremont", "Cygnet", "Dodges Ferry",
  "Glenorchy", "Hobart", "Huonville Lions", "Hutchins", "Kingborough Tigers",
  "Lauderdale", "Lindisfarne", "New Norfolk", "North Hobart", "Sorell",
  "St Virgils", "University",
];

const stjflTeams = [
  "Central Hawks JFC", "Brighton JFC", "Channel JFC", "Claremont JFC",
  "Clarence FC", "Glenorchy District JFC", "Hobart JFC", "Huonville Lions JFC",
  "Kingborough Tigers JFC", "Lauderdale FC", "Lindisfarne JFC", "New Norfolk JFC",
  "North Hobart JFC", "Sandy Bay Lions JFC", "South East JFC",
  "Southern Storm Youth FC", "Triabunna Roos JFC",
];

async function seed() {
  console.log("\n🌱 Seeding leagues...");
  for (const name of ["SFL", "STJFL"]) {
    try {
      await db.execute({ sql: "INSERT OR IGNORE INTO leagues (name) VALUES (?)", args: [name] });
      console.log(`  ✓ ${name}`);
    } catch (err) { console.error(`  ✗ ${name}:`, err.message); }
  }

  const leagueRows = await db.execute("SELECT id, name FROM leagues");
  const leagueMap = Object.fromEntries(leagueRows.rows.map(r => [r.name, r.id]));

  console.log("\n🌱 Seeding SFL teams...");
  for (const name of sflTeams) {
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO teams (league_id, name, age_group) VALUES (?, ?, NULL)",
        args: [leagueMap["SFL"], name],
      });
      console.log(`  ✓ ${name}`);
    } catch (err) { console.error(`  ✗ ${name}:`, err.message); }
  }

  console.log("\n🌱 Seeding STJFL teams...");
  for (const name of stjflTeams) {
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO teams (league_id, name, age_group) VALUES (?, ?, NULL)",
        args: [leagueMap["STJFL"], name],
      });
      console.log(`  ✓ ${name}`);
    } catch (err) { console.error(`  ✗ ${name}:`, err.message); }
  }

  const lCount = await db.execute("SELECT COUNT(*) as n FROM leagues");
  const tCount = await db.execute("SELECT COUNT(*) as n FROM teams");
  console.log(`\n✅ Done — leagues: ${lCount.rows[0].n}, teams: ${tCount.rows[0].n}`);
}

await migrate();
await seed();
