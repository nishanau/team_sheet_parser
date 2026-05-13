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
  /** Best & Fairest only — the team that submitted these votes, i.e. the team
   *  every voted player belongs to. Coaches votes have no single such team
   *  (players come from either side), so this is undefined for them. */
  submittingTeam?: string | null;
};

/** Extract all (playerName, playerNumber, votes, round) from a set of vote rows.
 *  For Best & Fairest the team is known up front (the submitting team); for coaches
 *  votes it stays "" and is resolved later via the roster lookup. */
function extractVotes(rows: VoteRow[]): VoteEntry[] {
  const result: VoteEntry[] = [];
  for (const row of rows) {
    const rowTeam = row.submittingTeam?.trim() ?? "";
    for (let i = 0; i < 5; i++) {
      const [nameKey, numKey] = PLAYER_FIELDS[i];
      const name = row[nameKey];
      if (!name) continue;
      result.push({ playerName: name, playerNumber: row[numKey] ?? null, team: rowTeam, votes: VOTE_WEIGHTS[i], round: row.round });
    }
  }
  return result;
}

type RosterMatch = { teamName: string; playerNumber: string | null };

/** Resolve each entry's team (and canonical jumper number) from a name → roster map.
 *  Player numbers change between rounds, but a player's name+team does not — so we
 *  match purely on name and adopt the roster's current number for display/grouping.
 *
 *  Entries that already carry a team (Best & Fairest, where the submitting team is
 *  authoritative) keep that team; we only borrow the roster's number, and only when
 *  the matched roster player is actually on that team — so a same-name player in
 *  another grade can't hijack the number. Entries with no team and no match keep
 *  team = "" and their original number. */
function resolveTeams(entries: VoteEntry[], roster: Map<string, RosterMatch>): VoteEntry[] {
  return entries.map((e) => {
    const match = roster.get(e.playerName.trim().toLowerCase());
    if (!match) return e;
    if (e.team) {
      return match.teamName === e.team ? { ...e, playerNumber: match.playerNumber } : e;
    }
    return { ...e, team: match.teamName, playerNumber: match.playerNumber };
  });
}

// Unique key: name + number + team. After resolveTeams the number is the roster's
// current value, so a player's votes across rounds collapse into one row while two
// genuinely different same-name players on a team stay separate.
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
      if (scopedTeamNames.length === 0) return NextResponse.json({ rows: [], rounds: [], totals: { bf: 0, coaches: 0 } });
    }

    // Build a "fullName" → { teamName, playerNumber } roster map. Names are stable
    // across rounds; numbers are not — so we key on name and carry the current
    // number along for display. (Same-name players on different teams: last write
    // wins — rare enough to accept, and was already the behaviour for exact keys.)
    function buildRoster(rows: { playerNumber: string | null; firstName: string; lastName: string; teamName: string }[]): Map<string, RosterMatch> {
      const map = new Map<string, RosterMatch>();
      for (const r of rows) {
        const key = `${r.firstName.trim().toLowerCase()} ${r.lastName.trim().toLowerCase()}`.trim();
        if (!key) continue;
        map.set(key, { teamName: r.teamName, playerNumber: r.playerNumber });
      }
      return map;
    }

    // Restrict the roster used for name → team resolution to the teams that play in
    // the grade being viewed. Without this, a player's name in (say) the U18 grade
    // could match a same-name player in the Senior grade and be mislabelled.
    // Club admins are already narrowed to their own teams; superadmins are narrowed
    // to the grade's teams when a grade is selected, and only fall back to the full
    // table for the cross-grade "all" view (where Best & Fairest entries carry their
    // own submitting team anyway).
    let rosterTeamNames: string[] | null = scopedTeamNames;
    if (!rosterTeamNames && grade) {
      const gradeTeams = await db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.gradeName, grade));
      rosterTeamNames = gradeTeams.map((t) => t.name);
    }

    const rosterRows = await db
      .select({ playerNumber: teamPlayers.playerNumber, firstName: teamPlayers.firstName, lastName: teamPlayers.lastName, teamName: teamPlayers.teamName })
      .from(teamPlayers)
      .where(rosterTeamNames ? inArray(teamPlayers.teamName, rosterTeamNames) : undefined);
    const rosterByName = buildRoster(rosterRows);

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

    // Resolve each player's team from the roster
    let entries = resolveTeams(rawEntries, rosterByName);

    // Club admins: keep only entries whose resolved team is one of their teams
    if (scopedTeamNames) {
      const teamSet = new Set(scopedTeamNames);
      entries = entries.filter((e) => teamSet.has(e.team));
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
