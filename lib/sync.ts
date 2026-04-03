import { createClient } from "@libsql/client";

import { ALLOWED_GRADES } from "@/lib/constants";

import { logger } from "./logger";

// ─── Config ───────────────────────────────────────────────────────────────────
const PLAYHQ_API        = "https://api.playhq.com/graphql";
const PLAYHQ_SEARCH_API = "https://search.playhq.com/graphql";
const PLAYHQ_HEADERS = {
  "Content-Type": "application/json",
  Accept: "*/*",
  Origin: "https://www.playhq.com",
  Tenant: "afl",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
};

export const SFL_ORG_ID = "cc453fd4";

export const STJFL_ORG_ID = "506fd6f4";

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

const Q_SEARCH_CLUBS = `
query search($filter: SearchFilter!) {
  search(filter: $filter) {
    results {
      ... on Organisation {
        id
        routingCode
        name
        __typename
      }
      __typename
    }
  }
}`;

const Q_ORG_TEAMS = `
query discoverOrganisationTeams($seasonId: ID!, $organisationId: ID!) {
  discoverTeams(filter: { seasonID: $seasonId, organisationID: $organisationId }) {
    id
    name
    gender { name value __typename }
    ageGroup { name value __typename }
    grade { id name __typename }
    __typename
  }
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function gql<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>,
  url: string = PLAYHQ_API
): Promise<T> {
  const res = await fetch(url, {
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

async function batchedMap<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
      else logger.warn("[sync] batch item failed", { category: "sync", reason: String(r.reason) });
    }
    if (i + batchSize < items.length) await sleep(delayMs);
  }
  return results;
}

async function fetchClubsForLeague(searchQuery: string): Promise<{ routingCode: string; name: string }[]> {
  type SearchData = {
    search: { results: { routingCode?: string; name?: string; __typename: string }[] };
  };
  const data = await gql<SearchData>(Q_SEARCH_CLUBS, {
    filter: {
      meta:         { limit: 30, page: 1 },
      organisation: { query: searchQuery, types: ["CLUB"], sports: ["AFL"] },
    },
  }, PLAYHQ_SEARCH_API);
  return (data.search?.results ?? [])
    .filter((r) => r.__typename === "Organisation" && r.routingCode)
    .map((r) => ({ routingCode: r.routingCode!, name: r.name ?? "" }));
}

// ─── Main sync ────────────────────────────────────────────────────────────────
export async function runSync(log: string[]): Promise<void> {
  const tursoUrl   = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  const isLocal = !tursoUrl || tursoUrl.startsWith("file:") || !tursoToken;
  const dbUrl   = isLocal ? "file:db/local.db" : tursoUrl!;

  const syncStartedAt = Date.now();
  logger.info("[sync] started", { category: "sync" });

  log.push(isLocal ? "Target: local db/local.db" : `Target: Turso (${dbUrl})`);

  const client = isLocal
    ? createClient({ url: dbUrl })
    : createClient({ url: dbUrl, authToken: tursoToken! });

  // Look up league IDs for SFL and STJFL
  const leagueRows = await client.execute("SELECT id, name FROM leagues WHERE name IN ('SFL', 'STJFL')");
  const leagueIdMap: Record<string, number> = {};
  for (const row of leagueRows.rows) {
    leagueIdMap[row.name as string] = row.id as number;
  }
  const sflLeagueId   = leagueIdMap["SFL"];
  const stjflLeagueId = leagueIdMap["STJFL"];
  if (!sflLeagueId)   throw new Error("SFL league not found in DB.");
  if (!stjflLeagueId) throw new Error("STJFL league not found in DB.");

  // ── Step 1: Fetch all active seasons + grades for SFL and STJFL ───────────
  type CompData = {
    discoverCompetitions: { id: string; name: string; seasons: { id: string; name: string; status: { value: string } }[] }[];
  };
  type SeasonData = { discoverSeason: { grades: { id: string; name: string }[] } };

  // gradeIds: { gradeId, gradeName, orgId }
  const gradeEntries: { gradeId: string; gradeName: string; orgId: string }[] = [];
  // active season ID per org — collected here for reuse in Step 7
  const activeSeasonIds: Record<string, string> = {};

  // Fetch both orgs' competitions in parallel, then process seasons sequentially per org
  const [sflCompData, stjflCompData] = await Promise.all([
    gql<CompData>(Q_COMPETITIONS, { organisationID: SFL_ORG_ID }),
    gql<CompData>(Q_COMPETITIONS, { organisationID: STJFL_ORG_ID }),
  ]);
  const compDataByOrg: Record<string, CompData> = {
    [SFL_ORG_ID]: sflCompData,
    [STJFL_ORG_ID]: stjflCompData,
  };

  for (const orgId of [SFL_ORG_ID, STJFL_ORG_ID]) {
    const label    = orgId === SFL_ORG_ID ? "SFL" : "STJFL";
    const compData = compDataByOrg[orgId];

    for (const comp of compData.discoverCompetitions ?? []) {
      for (const season of comp.seasons ?? []) {
        if (!["ACTIVE", "UPCOMING"].includes(season.status?.value ?? "")) continue;

        // Record the first active season per org
        if (!activeSeasonIds[orgId]) activeSeasonIds[orgId] = season.id;

        const seasonData = await gql<SeasonData>(Q_SEASON_GRADES, { seasonID: season.id });
        await sleep(300);

        for (const grade of seasonData.discoverSeason?.grades ?? []) {
          // For SFL, only sync ALLOWED_GRADES; for STJFL, sync all grades
          if (orgId === SFL_ORG_ID && !ALLOWED_GRADES.has(grade.name)) continue;
          gradeEntries.push({ gradeId: grade.id, gradeName: grade.name, orgId });
          log.push(`  [${label}] Grade found: ${grade.name} (${grade.id})`);
        }
      }
    }

    await sleep(300);
  }

  log.push(`Grades to sync: ${gradeEntries.length} (SFL: ${gradeEntries.filter(g => g.orgId === SFL_ORG_ID).length}, STJFL: ${gradeEntries.filter(g => g.orgId === STJFL_ORG_ID).length})`);
  logger.info("[sync] step1 complete", {
    category: "sync",
    gradeCount: gradeEntries.length,
    sflGrades: gradeEntries.filter((g) => g.orgId === SFL_ORG_ID).length,
    stjflGrades: gradeEntries.filter((g) => g.orgId === STJFL_ORG_ID).length,
  });

  // ── Step 2: For each grade, fetch ladder → get team IDs ───────────────────
  type LadderData = {
    discoverGrade: {
      name: string;
      ladder: { standings: { team: { id: string; name: string } }[] }[];
    };
  };
  // teamId → { gradeName, orgId }
  const uniqueTeamIds = new Map<string, { gradeName: string; orgId: string }>();

  await batchedMap(gradeEntries, 5, 300, async ({ gradeId, gradeName, orgId }) => {
    const label = orgId === SFL_ORG_ID ? "SFL" : "STJFL";
    const data = await gql<LadderData>(Q_GRADE_LADDER, { gradeID: gradeId });
    const standings = (data.discoverGrade?.ladder ?? []).flatMap((l) => l.standings ?? []);
    for (const s of standings) {
      if (s.team?.id && !uniqueTeamIds.has(s.team.id)) {
        uniqueTeamIds.set(s.team.id, { gradeName, orgId });
      }
    }
    log.push(`  [${label}] ${gradeName}: ${standings.length} teams`);
  });
  logger.info("[sync] step2 complete", { category: "sync", teamCount: uniqueTeamIds.size });

  // ── Step 3: Collect all games via teamFixture ─────────────────────────────
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

  // { gameId → { game data, orgId } }
  const allGames = new Map<string, {
    id: string; gradeName: string; roundName: string; date: string;
    homeTeamName: string; awayTeamName: string; venueName: string | null; orgId: string;
  }>();

  await batchedMap([...uniqueTeamIds.entries()], 5, 300, async ([teamId, { orgId }]) => {
    const data = await gql<FixtureData>(Q_TEAM_FIXTURE, { teamID: teamId });

    for (const round of data.discoverTeamFixture ?? []) {
      const gn = round.grade?.name ?? "";
      // For SFL, filter to ALLOWED_GRADES; for STJFL, accept all
      if (orgId === SFL_ORG_ID && !ALLOWED_GRADES.has(gn)) continue;

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
          orgId,
        });
      }
    }
  });

  const sflGames   = [...allGames.values()].filter(g => g.orgId === SFL_ORG_ID);
  const stjflGames = [...allGames.values()].filter(g => g.orgId === STJFL_ORG_ID);
  log.push(`Total unique games collected: ${allGames.size} (SFL: ${sflGames.length}, STJFL: ${stjflGames.length})`);
  logger.info("[sync] step3 complete", {
    category: "sync",
    gameCount: allGames.size,
    sflGames: sflGames.length,
    stjflGames: stjflGames.length,
  });

  // ── Step 4: Write teams to DB ─────────────────────────────────────────────
  await client.execute({ sql: "DELETE FROM teams WHERE league_id = ?", args: [sflLeagueId] });
  await client.execute({ sql: "DELETE FROM teams WHERE league_id = ?", args: [stjflLeagueId] });

  // Build distinct (teamName, gradeName) pairs per league
  const sflTeamRows   = new Map<string, string>(); // `${gradeName}::${teamName}` → gradeName
  const stjflTeamRows = new Map<string, string>();

  for (const g of allGames.values()) {
    const map = g.orgId === SFL_ORG_ID ? sflTeamRows : stjflTeamRows;
    if (g.homeTeamName) map.set(`${g.gradeName}::${g.homeTeamName}`, g.gradeName);
    if (g.awayTeamName) map.set(`${g.gradeName}::${g.awayTeamName}`, g.gradeName);
  }

  const teamInserts: { sql: string; args: (string | number)[] }[] = [];
  for (const [leagueId, teamMap] of [[sflLeagueId, sflTeamRows], [stjflLeagueId, stjflTeamRows]] as [number, Map<string, string>][]) {
    for (const [key, gradeName] of teamMap) {
      const teamName = key.slice(gradeName.length + 2);
      if (!teamName || teamName === "TBC") continue;
      teamInserts.push({ sql: "INSERT INTO teams (league_id, name, grade_name) VALUES (?, ?, ?)", args: [leagueId, teamName, gradeName] });
    }
  }
  if (teamInserts.length > 0) await client.batch(teamInserts, "write");
  log.push(`Teams inserted: ${teamInserts.length}`);
  logger.info("[sync] step4 complete", { category: "sync", teamsInserted: teamInserts.length });

  // ── Step 5: Write fixtures to DB ──────────────────────────────────────────
  // Delete and replace SFL fixtures by grade name
  const sflGradeList = [...ALLOWED_GRADES];
  const sflPh = sflGradeList.map(() => "?").join(",");
  await client.execute({ sql: `DELETE FROM fixtures WHERE grade_name IN (${sflPh})`, args: sflGradeList });

  // Delete STJFL fixtures by collecting grade names found in this sync
  const stjflGradeNames = [...new Set(stjflGames.map(g => g.gradeName))];
  if (stjflGradeNames.length > 0) {
    const stjflPh = stjflGradeNames.map(() => "?").join(",");
    await client.execute({ sql: `DELETE FROM fixtures WHERE grade_name IN (${stjflPh})`, args: stjflGradeNames });
  }

  const fixtureInserts: { sql: string; args: (string | null)[] }[] = [];
  for (const g of allGames.values()) {
    if (!g.homeTeamName || !g.awayTeamName || !g.date) continue;
    fixtureInserts.push({
      sql:  `INSERT OR REPLACE INTO fixtures (id, grade_name, round_name, match_date, home_team_name, away_team_name, venue_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [g.id, g.gradeName, g.roundName, g.date, g.homeTeamName, g.awayTeamName, g.venueName],
    });
  }
  if (fixtureInserts.length > 0) await client.batch(fixtureInserts, "write");
  log.push(`Fixtures inserted: ${fixtureInserts.length}`);
  logger.info("[sync] step5 complete", { category: "sync", fixturesInserted: fixtureInserts.length });

  // ── Step 6: Fetch clubs for SFL and STJFL ────────────────────────────────
  log.push("Fetching clubs from PlayHQ...");

  const [sflClubs, stjflClubs] = await Promise.all([
    fetchClubsForLeague("(sfl) tas"),
    fetchClubsForLeague("(stjfl)"),
  ]);
  const allClubs = [...sflClubs, ...stjflClubs];

  log.push(`  Clubs found: ${sflClubs.length} SFL, ${stjflClubs.length} STJFL`);
  logger.info("[sync] step6 complete", { category: "sync", sflClubs: sflClubs.length, stjflClubs: stjflClubs.length });

  // ── Step 7: For each club, get its teams for the active season and link ──
  const sflSeasonId   = activeSeasonIds[SFL_ORG_ID];
  const stjflSeasonId = activeSeasonIds[STJFL_ORG_ID];

  type OrgTeamsData = {
    discoverTeams: {
      id: string;
      name: string;
      gender: { name: string; value: string } | null;
      ageGroup: { name: string; value: string } | null;
      grade: { id: string; name: string };
    }[];
  };

  let clubsLinked = 0;

  await batchedMap(allClubs, 5, 300, async (club) => {
    const isStjfl  = stjflClubs.some((c) => c.routingCode === club.routingCode);
    const seasonId = isStjfl ? stjflSeasonId : sflSeasonId;

    if (!seasonId) {
      log.push(`  Skipping ${club.name} — no active season found`);
      return;
    }

    const data = await gql<OrgTeamsData>(Q_ORG_TEAMS, {
      seasonId:      seasonId,
      organisationId: club.routingCode,
    });

    const clubName = club.name;

    // Upsert club by playhq_id
    await client.execute({
      sql: `INSERT INTO clubs (name, playhq_id) VALUES (?, ?)
            ON CONFLICT (playhq_id) DO UPDATE SET name = excluded.name`,
      args: [clubName, club.routingCode],
    });

    const clubRow = await client.execute({
      sql:  "SELECT id FROM clubs WHERE playhq_id = ?",
      args: [club.routingCode],
    });
    const clubId = clubRow.rows[0]?.id;
    if (!clubId) return;

    // Link each team to this club by (name, grade_name) — batched in one round-trip
    const teamUpdates = (data.discoverTeams ?? [])
      .filter((team) => {
        const gn = team.grade?.name ?? "";
        return isStjfl || ALLOWED_GRADES.has(gn);
      })
      .map((team) => ({
        sql:  "UPDATE teams SET club_id = ? WHERE name = ? AND grade_name = ?",
        args: [clubId, team.name, team.grade?.name ?? ""] as (string | number)[],
      }));
    if (teamUpdates.length > 0) await client.batch(teamUpdates, "write");

    clubsLinked++;
  });

  log.push(`Clubs upserted and teams linked: ${clubsLinked}`);
  logger.info("[sync] step7 complete", { category: "sync", clubsLinked });
  logger.info("[sync] completed", { category: "sync", durationMs: Date.now() - syncStartedAt });
}
