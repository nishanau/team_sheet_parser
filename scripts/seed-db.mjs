import { createClient } from "@libsql/client";

const db = createClient({ url: "file:db/local.db" });

// ─── Leagues ──────────────────────────────────────────────────────────────────
const leagueData = ["SFL", "STJFL"];

// ─── Teams ────────────────────────────────────────────────────────────────────
// SFL teams compete across all age groups so age_group is null
const sflTeams = [
  "Brighton",
  "Clarence",
  "Claremont",
  "Cygnet",
  "Dodges Ferry",
  "Glenorchy",
  "Hobart",
  "Huonville Lions",
  "Hutchins",
  "Kingborough Tigers",
  "Lauderdale",
  "Lindisfarne",
  "New Norfolk",
  "North Hobart",
  "Sorell",
  "St Virgils",
  "University",
];

// STJFL teams — each team competes in specific age groups
// A team that plays in multiple age groups gets one row per age group
const stjflTeams = [
  { name: "Central Hawks JFC",       ageGroup: null },
  { name: "Brighton JFC",            ageGroup: null },
  { name: "Channel JFC",             ageGroup: null },
  { name: "Claremont JFC",           ageGroup: null },
  { name: "Clarence FC",             ageGroup: null },
  { name: "Glenorchy District JFC",  ageGroup: null },
  { name: "Hobart JFC",              ageGroup: null },
  { name: "Huonville Lions JFC",     ageGroup: null },
  { name: "Kingborough Tigers JFC",  ageGroup: null },
  { name: "Lauderdale FC",           ageGroup: null },
  { name: "Lindisfarne JFC",         ageGroup: null },
  { name: "New Norfolk JFC",         ageGroup: null },
  { name: "North Hobart JFC",        ageGroup: null },
  { name: "Sandy Bay Lions JFC",     ageGroup: null },
  { name: "South East JFC",          ageGroup: null },
  { name: "Southern Storm Youth FC", ageGroup: null },
  { name: "Triabunna Roos JFC",      ageGroup: null },
];

async function seed() {
  console.log("🌱 Seeding leagues...");

  // Insert leagues
  for (const name of leagueData) {
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO leagues (name) VALUES (?)",
        args: [name],
      });
      console.log(`  ✓ League: ${name}`);
    } catch (err) {
      console.error(`  ✗ League ${name}:`, err.message);
    }
  }

  // Fetch league IDs
  const leagueRows = await db.execute("SELECT id, name FROM leagues");
  const leagueMap = Object.fromEntries(leagueRows.rows.map(r => [r.name, r.id]));
  console.log("  League IDs:", leagueMap);

  console.log("\n🌱 Seeding SFL teams...");
  for (const name of sflTeams) {
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO teams (league_id, name, age_group) VALUES (?, ?, NULL)",
        args: [leagueMap["SFL"], name],
      });
      console.log(`  ✓ SFL team: ${name}`);
    } catch (err) {
      console.error(`  ✗ SFL team ${name}:`, err.message);
    }
  }

  console.log("\n🌱 Seeding STJFL teams...");
  for (const { name, ageGroup } of stjflTeams) {
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO teams (league_id, name, age_group) VALUES (?, ?, ?)",
        args: [leagueMap["STJFL"], name, ageGroup],
      });
      console.log(`  ✓ STJFL team: ${name}`);
    } catch (err) {
      console.error(`  ✗ STJFL team ${name}:`, err.message);
    }
  }

  // Summary
  const leagueCount = await db.execute("SELECT COUNT(*) as n FROM leagues");
  const teamCount   = await db.execute("SELECT COUNT(*) as n FROM teams");
  const playerCount = await db.execute("SELECT COUNT(*) as n FROM players");

  console.log("\n✅ Seed complete:");
  console.log(`  leagues: ${leagueCount.rows[0].n}`);
  console.log(`  teams:   ${teamCount.rows[0].n}`);
  console.log(`  players: ${playerCount.rows[0].n} (none seeded — add via app)`);
}

seed().catch(console.error);
