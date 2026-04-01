/**
 * sync-playhq.mjs
 * Reads playhq.db (scraped by playhq_scraper.py) and upserts grade-scoped
 * teams and fixtures into the app DB.
 *
 * Run: node scripts/sync-playhq.mjs              (local only)
 * Run: node scripts/sync-playhq.mjs --turso       (local + Turso)
 * Run: node scripts/sync-playhq.mjs --turso-only  (Turso only)
 */
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import { resolve } from "path";

const TURSO_URL   = "libsql://football-app-nishanau83.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ5MjEwMDksImlkIjoiMDE5ZDQxODgtMTEwMS03ODQwLWFlNjUtOTZjM2VhZmRlOWZjIiwicmlkIjoiY2Y0MGFiMzktNWRmNy00NWEzLWJlNjYtYWQzOTFmZjIzYjBiIn0.kPHXMwCGFIyomemX2NoWAjXrF5dYkkptjvARNN4zPCkxPTI05dZiQRoe2bMrgykL0mzK0x-HfmpdZfIhn7cVBw";

const ALLOWED_GRADES = new Set([
  "SFL Premier League Senior Men",
  "SFL Community League Senior Men",
  "SFL Premier League Reserves Men",
  "SFL Community League Reserves Men",
  "SFL Premier League U18 Boys",
  "SFL Community League U18 Boys",
  "SFL Premier League Senior Women",
  "SFL Community League Senior Women",
]);

// ─── Read from playhq.db ──────────────────────────────────────────────────────
const phq = new Database(resolve("playhq.db"), { readonly: true });

if (!phq.prepare("SELECT id FROM organisations WHERE league = 'SFL'").get()) {
  console.error("SFL organisation not found in playhq.db. Run playhq_scraper.py first.");
  process.exit(1);
}

const gradeList = [...ALLOWED_GRADES];
const ph = gradeList.map(() => "?").join(",");

const playhqTeams = phq
  .prepare(`SELECT name, grade_name FROM teams WHERE grade_name IN (${ph}) ORDER BY grade_name, name`)
  .all(...gradeList);

const playhqGames = phq
  .prepare(`SELECT id, grade_name, round_name, date, home_team_name, away_team_name, venue_name
            FROM games WHERE grade_name IN (${ph}) ORDER BY date, grade_name`)
  .all(...gradeList);

phq.close();

const clean = (s) => s.replace(/\s{2,}/g, " ").trim();

console.log(`PlayHQ teams to sync: ${playhqTeams.length}`);
console.log(`PlayHQ fixtures to sync: ${playhqGames.length}`);

// ─── Sync to local SQLite (better-sqlite3, no lock conflict) ──────────────────
function syncLocal(label) {
  console.log(`\n${label}`);
  const appDb = new Database(resolve("db/local.db"));
  appDb.pragma("journal_mode = WAL");

  const sflLeagueId = appDb.prepare("SELECT id FROM leagues WHERE name = 'SFL'").get()?.id;
  if (!sflLeagueId) { console.error("  SFL league not found."); appDb.close(); return; }

  // Teams
  appDb.prepare("DELETE FROM teams WHERE league_id = ?").run(sflLeagueId);
  const insertTeam = appDb.prepare("INSERT INTO teams (league_id, name, grade_name) VALUES (?, ?, ?)");
  appDb.transaction((teams) => { for (const t of teams) insertTeam.run(sflLeagueId, clean(t.name), t.grade_name); })(playhqTeams);
  console.log(`  Inserted ${playhqTeams.length} SFL teams`);

  const stjflId = appDb.prepare("SELECT id FROM leagues WHERE name = 'STJFL'").get()?.id;
  if (stjflId) appDb.prepare("UPDATE teams SET grade_name = NULL WHERE league_id = ?").run(stjflId);

  // Fixtures
  appDb.prepare(`DELETE FROM fixtures WHERE grade_name IN (${ph})`).run(...gradeList);
  const insertFixture = appDb.prepare(
    `INSERT OR REPLACE INTO fixtures (id, grade_name, round_name, match_date, home_team_name, away_team_name, venue_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  appDb.transaction((games) => {
    for (const g of games)
      insertFixture.run(g.id, g.grade_name, g.round_name, g.date, clean(g.home_team_name), clean(g.away_team_name), g.venue_name ?? null);
  })(playhqGames);
  console.log(`  Inserted ${playhqGames.length} fixtures`);
  console.log(`  Total teams: ${appDb.prepare("SELECT COUNT(*) as n FROM teams").get().n}`);

  appDb.close();
}

// ─── Sync to Turso (remote libsql) ───────────────────────────────────────────
async function syncTurso(label) {
  console.log(`\n${label}`);
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  const leagueRows = await client.execute("SELECT id FROM leagues WHERE name = 'SFL'");
  const sflLeagueId = leagueRows.rows[0]?.id;
  if (!sflLeagueId) { console.error("  SFL league not found."); return; }

  await client.execute({ sql: "DELETE FROM teams WHERE league_id = ?", args: [sflLeagueId] });
  for (const t of playhqTeams)
    await client.execute({ sql: "INSERT INTO teams (league_id, name, grade_name) VALUES (?, ?, ?)", args: [sflLeagueId, clean(t.name), t.grade_name] });
  console.log(`  Inserted ${playhqTeams.length} SFL teams`);

  const stjflRows = await client.execute("SELECT id FROM leagues WHERE name = 'STJFL'");
  if (stjflRows.rows[0]?.id)
    await client.execute({ sql: "UPDATE teams SET grade_name = NULL WHERE league_id = ?", args: [stjflRows.rows[0].id] });

  await client.execute({ sql: `DELETE FROM fixtures WHERE grade_name IN (${ph})`, args: gradeList });
  for (const g of playhqGames)
    await client.execute({
      sql:  `INSERT OR REPLACE INTO fixtures (id, grade_name, round_name, match_date, home_team_name, away_team_name, venue_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [g.id, g.grade_name, g.round_name, g.date, clean(g.home_team_name), clean(g.away_team_name), g.venue_name ?? null],
    });
  console.log(`  Inserted ${playhqGames.length} fixtures`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const tursoOnly = args.includes("--turso-only");
const withTurso = args.includes("--turso") || tursoOnly;

if (!tursoOnly) syncLocal("Local DB (db/local.db)");

if (withTurso) {
  await syncTurso("Turso production DB");
} else if (!tursoOnly) {
  console.log("\nTurso skipped - run with --turso to also sync production.");
}

console.log("\nSync done.");
process.exit(0);
