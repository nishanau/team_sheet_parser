/**
 * backfill-bnf-opposition.mjs
 *
 * One-off data fix for best_and_fairest rows where opposition === home_team
 * (i.e. the submitter's own team was wrongly recorded as the opposition).
 *
 * Background: the submission API used to persist `home_team = submittingTeam`
 * (correct) but `opposition = fixture.away_team_name` (wrong when the submitter
 * was the away side). This script finds the correct opposition by looking up
 * the fixture by (grade, round, match_date) and picking whichever side isn't
 * the submitter.
 *
 * Run: node --env-file=.env.local scripts/backfill-bnf-opposition.mjs
 *      Add --dry to preview without writing.
 */
import { createClient } from "@libsql/client";

const url       = process.env.TURSO_DATABASE_URL ?? "file:./db/local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const dryRun    = process.argv.includes("--dry");

if (!url) {
  console.error("Missing TURSO_DATABASE_URL");
  process.exit(1);
}

const client = createClient({ url, authToken });

const broken = await client.execute(`
  SELECT id, grade, round, match_date, home_team
  FROM best_and_fairest
  WHERE home_team IS NOT NULL
    AND opposition IS NOT NULL
    AND home_team = opposition
`);

console.log(`Found ${broken.rows.length} broken row(s).`);
if (broken.rows.length === 0) process.exit(0);

let fixed = 0;
let skipped = 0;
const skippedDetails = [];

for (const row of broken.rows) {
  const { id, grade, round, match_date, home_team } = row;

  // Find the fixture by grade+round+date where one side is the submitting team.
  const fx = await client.execute({
    sql: `
      SELECT home_team_name, away_team_name
      FROM fixtures
      WHERE grade_name = ?
        AND round_name = ?
        AND match_date = ?
        AND (home_team_name = ? OR away_team_name = ?)
      LIMIT 2
    `,
    args: [grade, round, match_date, home_team, home_team],
  });

  if (fx.rows.length !== 1) {
    skipped++;
    skippedDetails.push({ id, reason: `${fx.rows.length} fixture matches`, grade, round, match_date, home_team });
    continue;
  }

  const { home_team_name, away_team_name } = fx.rows[0];
  const correctOpposition = home_team_name === home_team ? away_team_name : home_team_name;

  if (correctOpposition === home_team) {
    skipped++;
    skippedDetails.push({ id, reason: "fixture is team-vs-itself", grade, round, match_date, home_team });
    continue;
  }

  console.log(`  id=${id} (${round}, ${match_date}): opposition "${home_team}" -> "${correctOpposition}"`);
  if (!dryRun) {
    await client.execute({
      sql: `UPDATE best_and_fairest SET opposition = ? WHERE id = ?`,
      args: [correctOpposition, id],
    });
  }
  fixed++;
}

console.log(`\n${dryRun ? "[DRY RUN] " : ""}Fixed ${fixed} row(s), skipped ${skipped}.`);
if (skipped > 0) {
  console.log("Skipped rows (manual review needed):");
  for (const s of skippedDetails) console.log(" ", s);
}
