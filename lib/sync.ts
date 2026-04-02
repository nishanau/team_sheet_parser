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

export const SFL_ORG_ID = "cc453fd4";

export const STJFL_ORG_ID = "506fd6f4";

export const ALLOWED_GRADES = new Set([
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
query discoverOrganisationTeams(
  $seasonCode: String!, $seasonId: ID!,
  $organisationCode: String!, $organisationId: ID!
) {
  discoverTeams(filter: { seasonID: $seasonId, organisationID: $organisationId }) {
    id
    name
    grade { id name __typename }
    __typename
  }
  discoverOrganisation(code: $organisationCode) {
    id
    name
    __typename
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
      else console.error("[cron] batch item failed:", r.reason);
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
  });
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
  type LadderData = {
    discoverGrade: {
      name: string;
      ladder: { standings: { team: { id: string; name: string } }[] }[];
    };
  };
  const teamIdsByGrade: Record<string, { teamId: string; gradeName: string }[]> = {};

  await batchedMap(gradeIds, 5, 300, async (gradeId) => {
    const data = await gql<LadderData>(Q_GRADE_LADDER, { gradeID: gradeId });
    const gradeName = data.discoverGrade?.name ?? "";
    const standings = (data.discoverGrade?.ladder ?? []).flatMap((l) => l.standings ?? []);
    teamIdsByGrade[gradeId] = standings
      .filter((s) => s.team?.id)
      .map((s) => ({ teamId: s.team.id, gradeName }));
    log.push(`  ${gradeName}: ${standings.length} teams`);
  });

  // ── Step 3: Collect all teams and games via teamFixture ───────────────────
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
    homeTeamName: string; awayTeamName: string; venueName: string | null;
  }>();

  // Collect unique team IDs across all grades (preserving gradeName for allTeams)
  const uniqueTeamIds = new Map<string, string>(); // teamId → gradeName
  for (const entries of Object.values(teamIdsByGrade)) {
    for (const { teamId, gradeName } of entries) {
      if (!uniqueTeamIds.has(teamId)) uniqueTeamIds.set(teamId, gradeName);
    }
  }

  await batchedMap([...uniqueTeamIds.entries()], 5, 300, async ([teamId]) => {
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
        });
      }
    }
  });

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

  // ── Step 6: Fetch clubs for SFL and STJFL ────────────────────────────────
  log.push("Fetching clubs from PlayHQ...");

  const sflClubs   = await fetchClubsForLeague("(sfl) tas");
  const stjflClubs = await fetchClubsForLeague("(stjfl)");
  const allClubs   = [...sflClubs, ...stjflClubs];

  log.push(`  Clubs found: ${sflClubs.length} SFL, ${stjflClubs.length} STJFL`);

  // ── Step 7: For each club, get its teams for the active season and link ──
  // Collect active season IDs per org (SFL season already found in Step 1)
  const seasonIds: Record<string, string> = {};
  for (const comp of compData.discoverCompetitions ?? []) {
    for (const season of comp.seasons ?? []) {
      if (!["ACTIVE", "UPCOMING"].includes(season.status?.value ?? "")) continue;
      seasonIds[SFL_ORG_ID] = season.id;
    }
  }

  // Fetch STJFL active season
  type StjflCompData = typeof compData;
  const stjflCompData = await gql<StjflCompData>(Q_COMPETITIONS, { organisationID: STJFL_ORG_ID });
  for (const comp of stjflCompData.discoverCompetitions ?? []) {
    for (const season of comp.seasons ?? []) {
      if (!["ACTIVE", "UPCOMING"].includes(season.status?.value ?? "")) continue;
      seasonIds[STJFL_ORG_ID] = season.id;
    }
  }

  const sflSeasonId   = seasonIds[SFL_ORG_ID];
  const stjflSeasonId = seasonIds[STJFL_ORG_ID];

  type OrgTeamsData = {
    discoverTeams: { id: string; name: string; grade: { id: string; name: string } }[];
    discoverOrganisation: { id: string; name: string };
  };

  let clubsLinked = 0;

  await batchedMap(allClubs, 5, 300, async (club) => {
    const isStjfl   = stjflClubs.some((c) => c.routingCode === club.routingCode);
    const seasonId  = isStjfl ? stjflSeasonId : sflSeasonId;

    if (!seasonId) {
      log.push(`  Skipping ${club.name} — no active season found`);
      return;
    }

    const data = await gql<OrgTeamsData>(Q_ORG_TEAMS, {
      seasonCode:       seasonId,
      seasonId:         seasonId,
      organisationCode: club.routingCode,
      organisationId:   club.routingCode,
    });

    const clubName = data.discoverOrganisation?.name ?? club.name;

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

    // Link each team to this club by (name, grade_name)
    for (const team of data.discoverTeams ?? []) {
      if (!ALLOWED_GRADES.has(team.grade?.name ?? "") && !isStjfl) continue;
      await client.execute({
        sql:  "UPDATE teams SET club_id = ? WHERE name = ? AND grade_name = ?",
        args: [clubId, team.name, team.grade?.name ?? ""],
      });
    }

    clubsLinked++;
  });

  log.push(`Clubs upserted and teams linked: ${clubsLinked}`);
}
