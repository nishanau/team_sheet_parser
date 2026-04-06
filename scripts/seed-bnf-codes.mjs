/**
 * Seed team_access_codes for ALL Best & Fairest eligible teams.
 *
 * Unlike add-access-codes.mjs (which hardcodes codes for the 2 CV grades),
 * this script reads every team from the `teams` table and generates a code
 * for any (teamName, gradeName) pair not already present.
 *
 * It also seeds STJFL teams from the hardcoded list in constants (since those
 * teams are not stored in the teams table with a gradeName — they're flat).
 *
 * Usage:
 *   node scripts/seed-bnf-codes.mjs              # local only
 *   node scripts/seed-bnf-codes.mjs --turso      # local + Turso
 *   node scripts/seed-bnf-codes.mjs --turso-only # Turso only
 *
 * Re-running is safe — INSERT OR IGNORE preserves existing codes.
 */

import { createClient }  from "@libsql/client";
import Database          from "better-sqlite3";
import { randomBytes }   from "crypto";
import { resolve }       from "path";

// ── Config ────────────────────────────────────────────────────────────────────
const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

// STJFL teams — not in teams table with a gradeName, so handled separately
// gradeName is null for STJFL in bestAndFairest, but we store the ageGroup
// as the gradeName for the access code so one code unlocks a team for all STJFL age groups.
const STJFL_AGE_GROUPS = [
  "U13 Boys",
  "U14 Girls",
  "U14 Boys",
  "U15 Boys",
  "U16 Girls",
];

const STJFL_TEAMS = [
  "Central Hawks JFC",
  "Brighton JFC",
  "Channel JFC",
  "Claremont JFC",
  "Clarence FC",
  "Glenorchy District JFC",
  "Hobart JFC",
  "Huonville Lions JFC",
  "Kingborough Tigers JFC",
  "Lauderdale FC",
  "Lindisfarne JFC",
  "New Norfolk JFC",
  "North Hobart JFC",
  "Sandy Bay Lions JFC",
  "South East JFC",
  "Southern Storm Youth FC",
  "Triabunna Roos JFC",
];

// ── Code generator ────────────────────────────────────────────────────────────
function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf   = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[buf[i] % chars.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// ── Local ─────────────────────────────────────────────────────────────────────
function syncLocal() {
  const db = new Database(resolve("db/local.db"));

  // Fetch all SFL teams with a gradeName from the teams table
  const sflTeams = db
    .prepare("SELECT name, grade_name FROM teams WHERE grade_name IS NOT NULL ORDER BY grade_name, name")
    .all();

  // Build the full set of (teamName, gradeName) pairs to seed
  const pairs = [];

  // SFL: one code per (team, grade)
  for (const t of sflTeams) {
    pairs.push({ teamName: t.name, gradeName: t.grade_name });
  }

  // STJFL: one code per (team, ageGroup)
  for (const ageGroup of STJFL_AGE_GROUPS) {
    for (const teamName of STJFL_TEAMS) {
      pairs.push({ teamName, gradeName: `STJFL ${ageGroup}` });
    }
  }

  const existing = new Set(
    db
      .prepare("SELECT team_name || '::' || grade_name AS k FROM team_access_codes")
      .all()
      .map((r) => r.k)
  );

  const insert   = db.prepare(
    "INSERT OR IGNORE INTO team_access_codes (team_name, grade_name, code) VALUES (?, ?, ?)"
  );
  const newCodes = [];

  db.transaction(() => {
    for (const p of pairs) {
      const key = `${p.teamName}::${p.gradeName}`;
      if (!existing.has(key)) {
        const code = genCode();
        insert.run(p.teamName, p.gradeName, code);
        newCodes.push({ ...p, code });
      }
    }
  })();

  console.log("\n✓ Local db/local.db: BnF access codes seeded");
  console.log(`  ${newCodes.length} new code(s) inserted (${existing.size} already existed)`);

  if (newCodes.length > 0) {
    console.log("\n  New codes:");
    console.log("  " + "-".repeat(80));
    for (const c of newCodes) {
      console.log(`  ${c.code}  ${c.teamName.padEnd(40)} ${c.gradeName}`);
    }
  }

  // Print full table
  const all = db
    .prepare("SELECT code, team_name, grade_name, active FROM team_access_codes ORDER BY grade_name, team_name")
    .all();
  console.log(`\n  Total codes in DB: ${all.length}`);
  console.log("  " + "-".repeat(80));
  for (const r of all) {
    const status = r.active ? "" : " [INACTIVE]";
    console.log(`  ${r.code}  ${r.team_name.padEnd(40)} ${r.grade_name}${status}`);
  }

  db.close();
}

// ── Turso ─────────────────────────────────────────────────────────────────────
async function syncTurso() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  // Fetch SFL teams from Turso
  const teamsResult = await client.execute(
    "SELECT name, grade_name FROM teams WHERE grade_name IS NOT NULL ORDER BY grade_name, name"
  );

  const pairs = [];
  for (const t of teamsResult.rows) {
    pairs.push({ teamName: String(t.name), gradeName: String(t.grade_name) });
  }
  for (const ageGroup of STJFL_AGE_GROUPS) {
    for (const teamName of STJFL_TEAMS) {
      pairs.push({ teamName, gradeName: `STJFL ${ageGroup}` });
    }
  }

  const existingResult = await client.execute(
    "SELECT team_name || '::' || grade_name AS k FROM team_access_codes"
  );
  const existing = new Set(existingResult.rows.map((r) => String(r.k)));

  const newCodes = [];
  for (const p of pairs) {
    const key = `${p.teamName}::${p.gradeName}`;
    if (!existing.has(key)) {
      const code = genCode();
      await client.execute({
        sql:  "INSERT OR IGNORE INTO team_access_codes (team_name, grade_name, code) VALUES (?, ?, ?)",
        args: [p.teamName, p.gradeName, code],
      });
      newCodes.push({ ...p, code });
    }
  }

  console.log("\n✓ Turso: BnF access codes seeded");
  console.log(`  ${newCodes.length} new code(s) inserted (${existing.size} already existed)`);

  if (newCodes.length > 0) {
    console.log("\n  New codes:");
    console.log("  " + "-".repeat(80));
    for (const c of newCodes) {
      console.log(`  ${c.code}  ${c.teamName.padEnd(40)} ${c.gradeName}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const tursoOnly = args.includes("--turso-only");
const withTurso = args.includes("--turso") || tursoOnly;

if (!tursoOnly) syncLocal();
if (withTurso) await syncTurso();
else if (!tursoOnly) console.log("\nℹ  Turso skipped — run with --turso to also migrate production.");
