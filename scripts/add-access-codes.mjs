/**
 * Migration: create team_access_codes table and seed codes for
 * SFL Community League Senior Men and Senior Women teams.
 *
 * Usage:
 *   node scripts/add-access-codes.mjs              # local only
 *   node scripts/add-access-codes.mjs --turso      # local + Turso
 *   node scripts/add-access-codes.mjs --turso-only # Turso only
 *
 * Re-running is safe — uses INSERT OR IGNORE so existing codes are preserved.
 */
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import { resolve } from "path";
import { randomBytes } from "crypto";

const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS team_access_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name  TEXT    NOT NULL,
  grade_name TEXT    NOT NULL,
  code       TEXT    NOT NULL UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1
);`;

const TEAMS = [
  // SFL Community League Senior Men
  { teamName: "Claremont Senior Men",      gradeName: "SFL Community League Senior Men" },
  { teamName: "Cygnet Senior Men",         gradeName: "SFL Community League Senior Men" },
  { teamName: "Dodges Ferry Senior Men",   gradeName: "SFL Community League Senior Men" },
  { teamName: "Hobart Senior Men",         gradeName: "SFL Community League Senior Men" },
  { teamName: "Huonville Lions Senior Men",gradeName: "SFL Community League Senior Men" },
  { teamName: "Lindisfarne Senior Men",    gradeName: "SFL Community League Senior Men" },
  { teamName: "New Norfolk Senior Men",    gradeName: "SFL Community League Senior Men" },
  { teamName: "Sorell Senior Men",         gradeName: "SFL Community League Senior Men" },
  // SFL Community League Senior Women
  { teamName: "Claremont Senior Women",      gradeName: "SFL Community League Senior Women" },
  { teamName: "Dodges Ferry Senior Women",   gradeName: "SFL Community League Senior Women" },
  { teamName: "Hobart Senior Women",         gradeName: "SFL Community League Senior Women" },
  { teamName: "Huonville Lions Senior Women",gradeName: "SFL Community League Senior Women" },
  { teamName: "Hutchins Senior Women",       gradeName: "SFL Community League Senior Women" },
  { teamName: "Lindisfarne Senior Women",    gradeName: "SFL Community League Senior Women" },
  { teamName: "New Norfolk Senior Women",    gradeName: "SFL Community League Senior Women" },
  { teamName: "Port Senior Women",           gradeName: "SFL Community League Senior Women" },
  { teamName: "Sorell Senior Women",         gradeName: "SFL Community League Senior Women" },
  { teamName: "University Senior Women",     gradeName: "SFL Community League Senior Women" },
];

// Generate a human-friendly 8-char uppercase code e.g. "A3BX-7K2M"
function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let s = "";
  const buf = randomBytes(8);
  for (let i = 0; i < 8; i++) s += chars[buf[i] % chars.length];
  return s.slice(0, 4) + "-" + s.slice(4);
}

// ── Local sync ────────────────────────────────────────────────────────────────
function syncLocal() {
  const db = new Database(resolve("db/local.db"));
  db.exec(CREATE_TABLE);

  const insert = db.prepare(
    "INSERT OR IGNORE INTO team_access_codes (team_name, grade_name, code) VALUES (?, ?, ?)"
  );
  const existing = new Set(
    db.prepare("SELECT team_name || '::' || grade_name AS k FROM team_access_codes").all().map((r) => r.k)
  );

  const newCodes = [];
  db.transaction(() => {
    for (const t of TEAMS) {
      const key = `${t.teamName}::${t.gradeName}`;
      if (!existing.has(key)) {
        const code = genCode();
        insert.run(t.teamName, t.gradeName, code);
        newCodes.push({ ...t, code });
      }
    }
  })();

  console.log("\n✓ Local db/local.db: team_access_codes table ready");
  if (newCodes.length === 0) {
    console.log("  All codes already exist — nothing inserted.");
  } else {
    console.log("\n  New codes generated:");
    console.log("  " + "-".repeat(72));
    for (const c of newCodes) {
      console.log(`  ${c.code}  ${c.teamName.padEnd(35)} ${c.gradeName}`);
    }
  }

  // Always print all current codes for reference
  const all = db.prepare("SELECT code, team_name, grade_name, active FROM team_access_codes ORDER BY grade_name, team_name").all();
  console.log("\n  Current codes:");
  console.log("  " + "-".repeat(72));
  for (const r of all) {
    const status = r.active ? "" : " [INACTIVE]";
    console.log(`  ${r.code}  ${r.team_name.padEnd(35)} ${r.grade_name}${status}`);
  }
  db.close();
}

// ── Turso sync ────────────────────────────────────────────────────────────────
async function syncTurso() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  await client.execute(CREATE_TABLE);

  const rows = await client.execute(
    "SELECT team_name || '::' || grade_name AS k FROM team_access_codes"
  );
  const existing = new Set(rows.rows.map((r) => r.k));

  const newCodes = [];
  for (const t of TEAMS) {
    const key = `${t.teamName}::${t.gradeName}`;
    if (!existing.has(key)) {
      const code = genCode();
      await client.execute({
        sql:  "INSERT OR IGNORE INTO team_access_codes (team_name, grade_name, code) VALUES (?, ?, ?)",
        args: [t.teamName, t.gradeName, code],
      });
      newCodes.push({ ...t, code });
    }
  }

  console.log("\n✓ Turso production DB: team_access_codes table ready");
  if (newCodes.length === 0) {
    console.log("  All codes already exist — nothing inserted.");
  } else {
    console.log("\n  New codes generated:");
    console.log("  " + "-".repeat(72));
    for (const c of newCodes) {
      console.log(`  ${c.code}  ${c.teamName.padEnd(35)} ${c.gradeName}`);
    }
  }

  const all = await client.execute(
    "SELECT code, team_name, grade_name, active FROM team_access_codes ORDER BY grade_name, team_name"
  );
  console.log("\n  Current codes:");
  console.log("  " + "-".repeat(72));
  for (const r of all.rows) {
    const status = r.active ? "" : " [INACTIVE]";
    console.log(`  ${r.code}  ${String(r.team_name).padEnd(35)} ${r.grade_name}${status}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const tursoOnly = args.includes("--turso-only");
const withTurso = args.includes("--turso") || tursoOnly;

if (!tursoOnly) syncLocal();
if (withTurso) await syncTurso();
else if (!tursoOnly) console.log("\nℹ  Turso skipped — run with --turso to also migrate production.");
