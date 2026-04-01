import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

// ─── Config ───────────────────────────────────────────────────────────────────
const PLAYHQ_API = "https://api.playhq.com/graphql";
const PLAYHQ_HEADERS = {
  "Content-Type": "application/json",
  Accept: "*/*",
  Origin: "https://www.playhq.com",
  Tenant: "afl",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
};

const SFL_ORG_ID = "cc453fd4";

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

// ─── GraphQL Queries ──────────────────────────────────────────────────────────
const Q_COMPETITIONS = `
query discoverCompetitions($organisationID: ID!) {
  discoverCompetitions(organisationID: $organisationID) {
    id name
    seasons(organisationID: $organisationID) {
      id name status { value }
    }
  }
}`;

const Q_SEASON_GRADES = `
query discoverSeason($seasonID: String!) {
  discoverSeason(seasonID: $seasonID) {
    grades { id name }
  }
}`;

const Q_GRADE_LADDER = `
query gradeLadder($gradeID: ID!) {
  discoverGrade(gradeID: $gradeID) {
    name
    ladder {
      standings {
        team { id name }
      }
    }
  }
}`;

const Q_TEAM_FIXTURE = `
query teamFixture($teamID: ID!) {
  discoverTeamFixture(teamID: $teamID) {
    name
    grade {
      id name
      season { id name competition { id name } }
    }
    fixture {
      games {
        id
        home { ... on DiscoverTeam { id name } ... on ProvisionalTeam { name } }
        away { ... on DiscoverTeam { id name } ... on ProvisionalTeam { name } }
        status { value }
        date
        allocation {
          court { name venue { name } }
        }
      }
    }
  }
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function gql<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(PLAYHQ_API, {
    method: "POST",
    headers: PLAYHQ_HEADERS,
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`PlayHQ HTTP ${res.status}`);
  const json = await res.json() as { data?: T };
  return (json.data ?? {}) as T;
}

function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/\s{2,}/g, " ").trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main sync ────────────────────────────────────────────────────────────────
async function runSync(log: string[]): Promise<void> {
  const tursoUrl   = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  const isLocal = !tursoUrl || tursoUrl.startsWith("file:") || !tursoToken;
  const dbUrl   = isLocal ? "file:db/local.db" : tursoUrl!;

  log.push(isLocal ? "Target: local db/local.db" : `Target: Turso (${dbUrl})`);

  const client = isLocal
    ? createClient({ url: dbUrl })
    : createClient({ url: dbUrl, authToken: tursoToken! });

  // Look up SFL league id
  const leagueRows = await client.execute("SELECT id FROM leagues WHERE name = 'SFL'");
  const sflLeagueId = leagueRows.rows[0]?.id as number | undefined;
  if (!sflLeagueId) throw new Error("SFL league not found in DB.");

  // ── Step 1: Fetch all active seasons + grades for SFL ──────────────────────
  type CompData = {
    discoverCompetitions: { id: string; name: string; seasons: { id: string; name: string; status: { value: string } }[] }[];
  };
  const compData = await gql<CompData>(Q_COMPETITIONS, {
    organisationID: SFL_ORG_ID,
  });

  const gradeIds: string[] = [];

  for (const comp of compData.discoverCompetitions ?? []) {
    for (const season of comp.seasons ?? []) {
      if (!["ACTIVE", "UPCOMING"].includes(season.status?.value ?? "")) continue;

      type SeasonData = { discoverSeason: { grades: { id: string; name: string }[] } };
      const seasonData = await gql<SeasonData>(Q_SEASON_GRADES, { seasonID: season.id });
      await sleep(300);

      for (const grade of seasonData.discoverSeason?.grades ?? []) {
        if (ALLOWED_GRADES.has(grade.name)) {
          gradeIds.push(grade.id);
          log.push(`  Grade found: ${grade.name} (${grade.id})`);
        }
      }
    }
  }

  log.push(`Grades to sync: ${gradeIds.length}`);

  // ── Step 2: For each grade, fetch ladder → get team IDs ───────────────────
  const teamIdsByGrade: Record<string, { teamId: string; gradeName: string }[]> = {};

  for (const gradeId of gradeIds) {
    type LadderData = {
      discoverGrade: {
        name: string;
        ladder: { standings: { team: { id: string; name: string } }[] }[];
      };
    };
    const data = await gql<LadderData>(Q_GRADE_LADDER, { gradeID: gradeId });
    await sleep(300);

    const gradeName = data.discoverGrade?.name ?? "";
    const standings = (data.discoverGrade?.ladder ?? []).flatMap((l) => l.standings ?? []);

    teamIdsByGrade[gradeId] = standings
      .filter((s) => s.team?.id)
      .map((s) => ({ teamId: s.team.id, gradeName }));

    log.push(`  ${gradeName}: ${standings.length} teams`);
  }

  // ── Step 3: Collect all teams and games via teamFixture ───────────────────
  const allTeams  = new Map<string, { name: string; gradeName: string }>();  // teamId → info
  const allGames  = new Map<string, {
    id: string; gradeName: string; roundName: string; date: string;
    homeTeamName: string; awayTeamName: string; venueName: string | null;
  }>();

  const visitedTeams = new Set<string>();

  for (const entries of Object.values(teamIdsByGrade)) {
    for (const { teamId, gradeName } of entries) {
      allTeams.set(teamId, { name: "", gradeName }); // name filled below

      if (visitedTeams.has(teamId)) continue;
      visitedTeams.add(teamId);

      type FixtureData = {
        discoverTeamFixture: {
          name: string;
          grade: { id: string; name: string; season: { id: string; name: string; competition: { id: string } } };
          fixture: {
            games: {
              id: string;
              home: { name?: string };
              away: { name?: string };
              status: { value: string };
              date: string;
              allocation?: { court?: { name?: string; venue?: { name?: string } } };
            }[];
          };
        }[];
      };

      const data = await gql<FixtureData>(Q_TEAM_FIXTURE, { teamID: teamId });
      await sleep(300);

      for (const round of data.discoverTeamFixture ?? []) {
        const gn = round.grade?.name ?? "";
        if (!ALLOWED_GRADES.has(gn)) continue;

        for (const game of round.fixture?.games ?? []) {
          if (!game.id) continue;
          const venue =
            game.allocation?.court?.venue?.name ??
            game.allocation?.court?.name ??
            null;
          allGames.set(game.id, {
            id: game.id,
            gradeName: gn,
            roundName: clean(round.name),
            date: game.date,
            homeTeamName: clean(game.home?.name),
            awayTeamName: clean(game.away?.name),
            venueName: venue ? clean(venue) : null,
          });
        }
      }
    }
  }

  log.push(`Total unique games collected: ${allGames.size}`);

  // ── Step 4: Write teams to Turso ─────────────────────────────────────────
  // Delete all SFL teams and re-insert
  await client.execute({ sql: "DELETE FROM teams WHERE league_id = ?", args: [sflLeagueId] });

  // Build distinct (teamName, gradeName) pairs from the collected game data
  const teamRows = new Map<string, string>(); // `${gradeName}::${teamName}` → gradeName
  for (const g of allGames.values()) {
    if (g.homeTeamName) teamRows.set(`${g.gradeName}::${g.homeTeamName}`, g.gradeName);
    if (g.awayTeamName) teamRows.set(`${g.gradeName}::${g.awayTeamName}`, g.gradeName);
  }

  let teamsInserted = 0;
  for (const [key, gradeName] of teamRows) {
    const teamName = key.slice(gradeName.length + 2);
    if (!teamName || teamName === "TBC") continue;
    await client.execute({
      sql:  "INSERT INTO teams (league_id, name, grade_name) VALUES (?, ?, ?)",
      args: [sflLeagueId, teamName, gradeName],
    });
    teamsInserted++;
  }
  log.push(`Teams inserted: ${teamsInserted}`);

  // ── Step 5: Write fixtures to Turso ──────────────────────────────────────
  // Delete existing SFL fixtures and replace
  const gradeList = [...ALLOWED_GRADES];
  const ph = gradeList.map(() => "?").join(",");
  await client.execute({ sql: `DELETE FROM fixtures WHERE grade_name IN (${ph})`, args: gradeList });

  let gamesInserted = 0;
  for (const g of allGames.values()) {
    if (!g.homeTeamName || !g.awayTeamName || !g.date) continue;
    await client.execute({
      sql: `INSERT OR REPLACE INTO fixtures
              (id, grade_name, round_name, match_date, home_team_name, away_team_name, venue_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [g.id, g.gradeName, g.roundName, g.date, g.homeTeamName, g.awayTeamName, g.venueName],
    });
    gamesInserted++;
  }
  log.push(`Fixtures inserted: ${gamesInserted}`);
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Vercel sends the CRON_SECRET as a Bearer token in the Authorization header.
  // When called manually (e.g. curl), pass ?secret=<CRON_SECRET> as fallback.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const querySecret = req.nextUrl.searchParams.get("secret");
    const provided = authHeader?.replace("Bearer ", "") ?? querySecret ?? "";
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const started = Date.now();
  const log: string[] = [`Sync started at ${new Date().toISOString()}`];

  try {
    await runSync(log);
    log.push(`Sync completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return NextResponse.json({ success: true, log });
  } catch (err) {
    const msg = (err as Error).message;
    log.push(`ERROR: ${msg}`);
    console.error("[cron/sync]", err);
    return NextResponse.json({ success: false, log, error: msg }, { status: 500 });
  }
}
