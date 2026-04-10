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
      meta:         { limit: 100, page: 1 },
      organisation: { query: searchQuery, types: ["CLUB"], sports: ["AFL"] },
    },
  }, PLAYHQ_SEARCH_API);
  return (data.search?.results ?? [])
    .filter((r) => r.__typename === "Organisation" && r.routingCode)
    .map((r) => ({ routingCode: r.routingCode!, name: r.name ?? "" }));
}

// ─── Fixture-only sync ────────────────────────────────────────────────────────
export async function runFixtureSync(log: string[]): Promise<void> {
  const tursoUrl   = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  const isLocal = !tursoUrl || tursoUrl.startsWith("file:") || !tursoToken;
  const dbUrl   = isLocal ? "file:db/local.db" : tursoUrl!;

  const syncStartedAt = Date.now();
  logger.info("[sync:fixtures] started", { category: "sync" });
  log.push(isLocal ? "Target: local db/local.db" : `Target: Turso (${dbUrl})`);

  const client = isLocal
    ? createClient({ url: dbUrl })
    : createClient({ url: dbUrl, authToken: tursoToken! });

  // Read team IDs and their league from DB — no PlayHQ API calls needed
  const teamRows = await client.execute("SELECT playhq_id, league_id FROM teams WHERE playhq_id IS NOT NULL");
  const teams = teamRows.rows.map((r) => ({ playhqId: r.playhq_id as string, leagueId: r.league_id as number }));
  log.push(`Teams loaded from DB: ${teams.length}`);

  if (teams.length === 0) {
    log.push("No teams in DB — run a full sync first.");
    logger.warn("[sync:fixtures] no teams in DB", { category: "sync" });
    return;
  }

  // Fetch fixtures per team
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

  const allGames = new Map<string, {
    id: string; gradeName: string; roundName: string; date: string;
    homeTeamName: string; awayTeamName: string; venueName: string | null; leagueId: number;
  }>();

  await batchedMap(teams, 5, 300, async ({ playhqId, leagueId }) => {
    const data = await gql<FixtureData>(Q_TEAM_FIXTURE, { teamID: playhqId });

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
          leagueId,
        });
      }
    }
  });

  log.push(`Total unique games collected: ${allGames.size}`);

  // Write fixtures
  const allGradeList = [...ALLOWED_GRADES];
  const allGradePh   = allGradeList.map(() => "?").join(",");
  await client.execute({ sql: `DELETE FROM fixtures WHERE grade_name IN (${allGradePh})`, args: allGradeList });

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
  logger.info("[sync:fixtures] completed", { category: "sync", fixturesInserted: fixtureInserts.length, durationMs: Date.now() - syncStartedAt });
}

// ─── Full sync ────────────────────────────────────────────────────────────────
export async function runFullSync(log: string[]): Promise<void> {
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

  // ── Step 1: Get active season IDs for SFL and STJFL ──────────────────────
  type CompData = {
    discoverCompetitions: { id: string; name: string; seasons: { id: string; name: string; status: { value: string } }[] }[];
  };

  const [sflCompData, stjflCompData] = await Promise.all([
    gql<CompData>(Q_COMPETITIONS, { organisationID: SFL_ORG_ID }),
    gql<CompData>(Q_COMPETITIONS, { organisationID: STJFL_ORG_ID }),
  ]);

  const activeSeasonIds: Record<string, string> = {};
  for (const [orgId, compData] of [[SFL_ORG_ID, sflCompData], [STJFL_ORG_ID, stjflCompData]] as [string, CompData][]) {
    for (const comp of compData.discoverCompetitions ?? []) {
      for (const season of comp.seasons ?? []) {
        if (!activeSeasonIds[orgId] && ["ACTIVE", "UPCOMING"].includes(season.status?.value ?? "")) {
          activeSeasonIds[orgId] = season.id;
        }
      }
    }
  }

  const sflSeasonId   = activeSeasonIds[SFL_ORG_ID];
  const stjflSeasonId = activeSeasonIds[STJFL_ORG_ID];
  if (!sflSeasonId)   throw new Error("No active SFL season found.");
  if (!stjflSeasonId) throw new Error("No active STJFL season found.");
  log.push(`Active seasons — SFL: ${sflSeasonId}, STJFL: ${stjflSeasonId}`);
  logger.info("[sync] step1 complete", { category: "sync", sflSeasonId, stjflSeasonId });

  // ── Step 2: Fetch clubs, upsert into DB, collect DB IDs ──────────────────
  const [sflClubs, stjflClubs] = await Promise.all([
    fetchClubsForLeague("(sfl) tas"),
    fetchClubsForLeague("(stjfl)"),
  ]);
  log.push(`Clubs found: ${sflClubs.length} SFL, ${stjflClubs.length} STJFL`);

  const allClubs = [
    ...sflClubs.map((c) => ({ ...c, isStjfl: false })),
    ...stjflClubs.map((c) => ({ ...c, isStjfl: true })),
  ];

  // Upsert all clubs sequentially and map routingCode → DB id
  const clubDbIds = new Map<string, number>();
  for (const club of allClubs) {
    await client.execute({
      sql:  `INSERT INTO clubs (name, playhq_id) VALUES (?, ?)
             ON CONFLICT (playhq_id) DO UPDATE SET name = excluded.name`,
      args: [club.name, club.routingCode],
    });
    const row = await client.execute({
      sql:  "SELECT id FROM clubs WHERE playhq_id = ?",
      args: [club.routingCode],
    });
    const dbId = row.rows[0]?.id;
    if (dbId) clubDbIds.set(club.routingCode, dbId as number);
  }
  logger.info("[sync] step2 complete", { category: "sync", clubCount: allClubs.length });

  // ── Step 3: For each club fetch its teams — club ownership known at discovery time ──
  type OrgTeamsData = {
    discoverTeams: {
      id: string;
      name: string;
      grade: { id: string; name: string };
    }[];
  };

  // teamId → { teamName, gradeName, clubDbId, leagueId }
  const allTeams = new Map<string, { teamName: string; gradeName: string; clubDbId: number; leagueId: number }>();

  await batchedMap(allClubs, 5, 300, async (club) => {
    const seasonId = club.isStjfl ? stjflSeasonId : sflSeasonId;
    const leagueId = club.isStjfl ? stjflLeagueId : sflLeagueId;
    const clubDbId = clubDbIds.get(club.routingCode);
    if (!clubDbId) return;

    const data = await gql<OrgTeamsData>(Q_ORG_TEAMS, {
      seasonId:       seasonId,
      organisationId: club.routingCode,
    });

    let count = 0;
    for (const team of data.discoverTeams ?? []) {
      if (!team.id || !team.name || team.name === "TBC") continue;
      if (!ALLOWED_GRADES.has(team.grade?.name ?? "")) continue;
      if (!allTeams.has(team.id)) {
        allTeams.set(team.id, {
          teamName:  clean(team.name),
          gradeName: team.grade.name,
          clubDbId,
          leagueId,
        });
        count++;
      }
    }
    log.push(`  ${club.name}: ${count} teams`);
  });

  log.push(`Total teams discovered: ${allTeams.size}`);
  logger.info("[sync] step3 complete", { category: "sync", teamCount: allTeams.size });

  // ── Step 4: Write teams to DB — club_id set at insert, no update pass needed ──
  await client.execute({ sql: "DELETE FROM teams WHERE league_id = ?", args: [sflLeagueId] });
  await client.execute({ sql: "DELETE FROM teams WHERE league_id = ?", args: [stjflLeagueId] });

  const teamInserts: { sql: string; args: (string | number)[] }[] = [];
  for (const [playhqId, { teamName, gradeName, clubDbId, leagueId }] of allTeams) {
    teamInserts.push({
      sql:  "INSERT INTO teams (league_id, name, grade_name, playhq_id, club_id) VALUES (?, ?, ?, ?, ?)",
      args: [leagueId, teamName, gradeName, playhqId, clubDbId],
    });
  }
  if (teamInserts.length > 0) await client.batch(teamInserts, "write");
  log.push(`Teams inserted: ${teamInserts.length}`);
  logger.info("[sync] step4 complete", { category: "sync", teamsInserted: teamInserts.length });

  // ── Step 5: Collect all games via Q_TEAM_FIXTURE ──────────────────────────
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

  const allGames = new Map<string, {
    id: string; gradeName: string; roundName: string; date: string;
    homeTeamName: string; awayTeamName: string; venueName: string | null; leagueId: number;
  }>();

  await batchedMap([...allTeams.entries()], 5, 300, async ([teamId, { leagueId }]) => {
    const data = await gql<FixtureData>(Q_TEAM_FIXTURE, { teamID: teamId });

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
          leagueId,
        });
      }
    }
  });

  const sflGameCount   = [...allGames.values()].filter((g) => g.leagueId === sflLeagueId).length;
  const stjflGameCount = [...allGames.values()].filter((g) => g.leagueId === stjflLeagueId).length;
  log.push(`Total unique games collected: ${allGames.size} (SFL: ${sflGameCount}, STJFL: ${stjflGameCount})`);
  logger.info("[sync] step5 complete", { category: "sync", gameCount: allGames.size, sflGameCount, stjflGameCount });

  // ── Step 6: Write fixtures to DB ──────────────────────────────────────────
  const allGradeList = [...ALLOWED_GRADES];
  const allGradePh   = allGradeList.map(() => "?").join(",");
  await client.execute({ sql: `DELETE FROM fixtures WHERE grade_name IN (${allGradePh})`, args: allGradeList });

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
  logger.info("[sync] step6 complete", { category: "sync", fixturesInserted: fixtureInserts.length });

  logger.info("[sync] completed", { category: "sync", durationMs: Date.now() - syncStartedAt });
}
