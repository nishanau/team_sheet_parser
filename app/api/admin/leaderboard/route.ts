import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bestAndFairest, coachesVotes, teams } from "@/db/schema";

// Vote weight per position (index 0 = player1 = 5 votes)
const VOTE_WEIGHTS = [5, 4, 3, 2, 1];

type VoteEntry = { playerName: string; playerNumber: string | null; team: string; votes: number; round: string };
type LeaderboardRow = { rank: number; playerName: string; playerNumber: string | null; team: string; roundVotes: number; totalVotes: number };

function extractVotes(
  rows: { player1Name: string | null; player1Number: string | null; player2Name: string | null; player2Number: string | null; player3Name: string | null; player3Number: string | null; player4Name: string | null; player4Number: string | null; player5Name: string | null; player5Number: string | null; homeTeam?: string | null; coachTeam?: string | null; round: string }[],
  teamField: "homeTeam" | "coachTeam"
): VoteEntry[] {
  const result: VoteEntry[] = [];
  const playerFields = [
    ["player1Name", "player1Number"],
    ["player2Name", "player2Number"],
    ["player3Name", "player3Number"],
    ["player4Name", "player4Number"],
    ["player5Name", "player5Number"],
  ] as const;

  for (const row of rows) {
    const team = (teamField === "homeTeam" ? row.homeTeam : row.coachTeam) ?? "";
    for (let i = 0; i < 5; i++) {
      const [nameKey, numKey] = playerFields[i];
      const name = row[nameKey];
      if (!name) continue;
      result.push({ playerName: name, playerNumber: row[numKey] ?? null, team, votes: VOTE_WEIGHTS[i], round: row.round });
    }
  }
  return result;
}

function buildLeaderboard(entries: VoteEntry[], selectedRound: string | "all"): LeaderboardRow[] {
  const map = new Map<string, LeaderboardRow & { rank: number }>();
  for (const e of entries) {
    const key      = `${e.playerName}::${e.team}`;
    const existing = map.get(key) ?? { rank: 0, playerName: e.playerName, playerNumber: e.playerNumber, team: e.team, roundVotes: 0, totalVotes: 0 };
    existing.totalVotes += e.votes;
    if (selectedRound !== "all" && e.round === selectedRound) existing.roundVotes += e.votes;
    map.set(key, existing);
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

  // Coaches votes: superadmin only
  if (type === "coaches" && session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Club admin: get their team names
  let scopedTeamNames: string[] | null = null;
  if (session.user.role === "club_admin" && session.user.clubId && session.user.leagueId) {
    const clubTeams = await db
      .select({ name: teams.name })
      .from(teams)
      .where(and(eq(teams.clubId, session.user.clubId), eq(teams.leagueId, session.user.leagueId)));
    scopedTeamNames = clubTeams.map((t) => t.name);
    if (scopedTeamNames.length === 0) return NextResponse.json([]);
  }

  if (type === "coaches") {
    const filters = [eq(coachesVotes.grade, grade)];
    const rows = await db.select().from(coachesVotes).where(and(...filters));
    const entries = extractVotes(rows as Parameters<typeof extractVotes>[0], "coachTeam");
    return NextResponse.json(buildLeaderboard(entries, round));
  }

  // Best & Fairest
  const bfFilters = [
    eq(bestAndFairest.competition, competition),
    ...(grade ? [eq(bestAndFairest.grade, grade)] : []),
    ...(scopedTeamNames ? [inArray(bestAndFairest.homeTeam as any, scopedTeamNames)] : []),
  ];
  const rows = await db.select().from(bestAndFairest).where(and(...bfFilters));
  const entries = extractVotes(rows as Parameters<typeof extractVotes>[0], "homeTeam");
  return NextResponse.json(buildLeaderboard(entries, round));
}
