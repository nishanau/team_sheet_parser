import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, count } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bestAndFairest, coachesVotes, teams, teamPlayers } from "@/db/schema";
import { ROUND_OPTIONS } from "@/lib/constants";
import { logger } from "@/lib/logger";

// Vote weight per position (index 0 = player1 = 5 votes)
const VOTE_WEIGHTS = [5, 4, 3, 2, 1];

type VoteEntry = { playerName: string; playerNumber: string | null; team: string; votes: number; round: string };
type LeaderboardRow = { rank: number; playerName: string; playerNumber: string | null; team: string; roundVotes: number; totalVotes: number };
type PivotRow = { rank: number; playerName: string; playerNumber: string | null; team: string; roundBreakdown: Record<string, number>; totalVotes: number };

const PLAYER_FIELDS = [
  ["player1Name", "player1Number"],
  ["player2Name", "player2Number"],
  ["player3Name", "player3Number"],
  ["player4Name", "player4Number"],
  ["player5Name", "player5Number"],
] as const;

type VoteRow = {
  player1Name: string | null; player1Number: string | null;
  player2Name: string | null; player2Number: string | null;
  player3Name: string | null; player3Number: string | null;
  player4Name: string | null; player4Number: string | null;
  player5Name: string | null; player5Number: string | null;
  round: string;
};

/** Extract all (playerName, playerNumber, votes, round) from a set of vote rows.
 *  `team` is left as an empty string here — it is resolved later via teamPlayers lookup. */
function extractVotes(rows: VoteRow[]): VoteEntry[] {
  const result: VoteEntry[] = [];
  for (const row of rows) {
    for (let i = 0; i < 5; i++) {
      const [nameKey, numKey] = PLAYER_FIELDS[i];
      const name = row[nameKey];
      if (!name) continue;
      result.push({ playerName: name, playerNumber: row[numKey] ?? null, team: "", votes: VOTE_WEIGHTS[i], round: row.round });
    }
  }
  return result;
}

/** Resolve the team for each entry using a roster map ("number::fullName" → teamName).
 *  Entries whose player cannot be matched are assigned team = "". */
function resolveTeams(entries: VoteEntry[], roster: Map<string, string>): VoteEntry[] {
  return entries.map((e) => ({
    ...e,
    team: roster.get(`${e.playerNumber ?? ""}::${e.playerName.trim().toLowerCase()}`) ?? "",
  }));
}

// Unique key: name + number + team (number differentiates same-name players)
function playerKey(e: VoteEntry) {
  return `${e.playerName}::${e.playerNumber ?? ""}::${e.team}`;
}

function buildLeaderboard(entries: VoteEntry[], selectedRound: string): LeaderboardRow[] {
  const map = new Map<string, LeaderboardRow>();
  for (const e of entries) {
    const key = playerKey(e);
    if (!map.has(key)) {
      map.set(key, { rank: 0, playerName: e.playerName, playerNumber: e.playerNumber, team: e.team, roundVotes: 0, totalVotes: 0 });
    }
    const row = map.get(key)!;
    row.totalVotes += e.votes;
    if (e.round === selectedRound) row.roundVotes += e.votes;
  }
  return [...map.values()]
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function buildPivot(entries: VoteEntry[], usedRounds: string[]): PivotRow[] {
  const map = new Map<string, PivotRow>();
  for (const e of entries) {
    const key = playerKey(e);
    if (!map.has(key)) {
      map.set(key, { rank: 0, playerName: e.playerName, playerNumber: e.playerNumber, team: e.team, roundBreakdown: {}, totalVotes: 0 });
    }
    const row = map.get(key)!;
    row.totalVotes += e.votes;
    row.roundBreakdown[e.round] = (row.roundBreakdown[e.round] ?? 0) + e.votes;
  }
  return [...map.values()]
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const type        = searchParams.get("type") ?? "bf";          // "bf" | "coaches"
  const competition = searchParams.get("competition") ?? "SFL";
  const grade       = searchParams.get("grade") ?? "";
  const round       = searchParams.get("round") ?? "all";

  // Coaches votes: superadmin always allowed; club_admin only if they have a CV-eligible grade
  // (hasCoachesTab on the session tells the UI whether to show the tab — the API enforces it too)
  if (type === "coaches" && session.user.role !== "superadmin" && !session.user.hasCoachesTab) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  logger.info("[admin/leaderboard] GET", {
    category: "api",
    type,
    competition,
    grade,
    round: round ?? null,
    role: session.user.role,
  });

  try {
    console.log("[leaderboard] session.user:", JSON.stringify(session.user));

    // Club admin: get their team names + grades (scoped by clubId only — leagueId may be null)
    let scopedTeamNames: string[] | null = null;
    let scopedGrades: string[] | null = null;
    if (session.user.role === "club_admin" && session.user.clubId) {
      const clubTeams = await db
        .select({ name: teams.name, gradeName: teams.gradeName })
        .from(teams)
        .where(eq(teams.clubId, session.user.clubId));
      scopedTeamNames = clubTeams.map((t) => t.name);
      scopedGrades = [...new Set(clubTeams.map((t) => t.gradeName).filter(Boolean))] as string[];
      console.log("[leaderboard] club_admin scopedTeamNames:", scopedTeamNames);
      console.log("[leaderboard] club_admin scopedGrades:", scopedGrades);
      if (scopedTeamNames.length === 0) return NextResponse.json({ rows: [], rounds: [], totals: { bf: 0, coaches: 0 } });
    }

    // Build a "number::fullName" → teamName roster map so cross-team number collisions
    // don't cause a player to be attributed to the wrong club.
    function buildRoster(rows: { playerNumber: string | null; firstName: string; lastName: string; teamName: string }[]): Map<string, string> {
      const map = new Map<string, string>();
      for (const r of rows) {
        if (!r.playerNumber) continue;
        const key = `${r.playerNumber}::${r.firstName.trim().toLowerCase()} ${r.lastName.trim().toLowerCase()}`;
        map.set(key, r.teamName);
      }
      return map;
    }

    let rosterByNumber: Map<string, string>;
    if (scopedTeamNames) {
      // Club admin — look up roster for their specific teams only
      const roster = await db
        .select({ playerNumber: teamPlayers.playerNumber, firstName: teamPlayers.firstName, lastName: teamPlayers.lastName, teamName: teamPlayers.teamName })
        .from(teamPlayers)
        .where(inArray(teamPlayers.teamName, scopedTeamNames));
      rosterByNumber = buildRoster(roster);
      console.log("[leaderboard] club_admin roster size:", rosterByNumber.size);
      console.log("[leaderboard] club_admin roster sample:", [...rosterByNumber.entries()].slice(0, 5));
    } else {
      // Superadmin — full roster to resolve team labels
      const roster = await db
        .select({ playerNumber: teamPlayers.playerNumber, firstName: teamPlayers.firstName, lastName: teamPlayers.lastName, teamName: teamPlayers.teamName })
        .from(teamPlayers);
      rosterByNumber = buildRoster(roster);
    }

    let rawEntries: VoteEntry[];

    if (type === "coaches") {
      const rows = await db.select().from(coachesVotes).where(eq(coachesVotes.grade, grade));
      rawEntries = extractVotes(rows);
    } else {
      // Best & Fairest — filter by grade (which already scopes the competition);
      // only add the competition filter for superadmin "all grades" queries without a specific grade.
      const bfFilters = [
        ...(grade
          ? [eq(bestAndFairest.grade, grade)]
          : [eq(bestAndFairest.competition, competition)]),
      ];
      const rows = await db.select().from(bestAndFairest).where(and(...bfFilters));
      rawEntries = extractVotes(rows);
    }

    console.log("[leaderboard] rawEntries count:", rawEntries.length);
    console.log("[leaderboard] rawEntries sample:", rawEntries.slice(0, 5).map((e) => ({ name: e.playerName, num: e.playerNumber, round: e.round })));

    // Resolve each player's team from the roster
    let entries = resolveTeams(rawEntries, rosterByNumber);

    console.log("[leaderboard] after resolveTeams sample:", entries.slice(0, 5).map((e) => ({ name: e.playerName, num: e.playerNumber, team: e.team })));

    // Club admins: keep only entries whose resolved team is one of their teams
    if (scopedTeamNames) {
      const teamSet = new Set(scopedTeamNames);
      const before = entries.length;
      entries = entries.filter((e) => teamSet.has(e.team));
      console.log("[leaderboard] after team filter:", entries.length, "of", before, "entries kept");
      console.log("[leaderboard] teams in filtered entries:", [...new Set(entries.map((e) => e.team))]);
    }

    // Count raw submissions for the selected grade (both types, regardless of active tab)
    const [[bfRow], [cvRow]] = await Promise.all([
      db.select({ c: count() }).from(bestAndFairest).where(eq(bestAndFairest.grade, grade)),
      db.select({ c: count() }).from(coachesVotes).where(eq(coachesVotes.grade, grade)),
    ]);
    const totals = { bf: bfRow.c, coaches: cvRow.c };

    if (round === "all") {
      // Find which rounds actually have votes, in canonical order
      const usedRoundsSet = new Set(entries.map((e) => e.round));
      const usedRounds = ROUND_OPTIONS.filter((r) => usedRoundsSet.has(r));
      return NextResponse.json({ mode: "pivot", rows: buildPivot(entries, usedRounds), rounds: usedRounds, totals });
    }

    return NextResponse.json({ mode: "round", rows: buildLeaderboard(entries, round), rounds: [], totals });
  } catch (err) {
    logger.error("[admin/leaderboard] GET failed", { category: "api", error: String(err), type, grade });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
