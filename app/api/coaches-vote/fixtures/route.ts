import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixtures, coachesVotes } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { VOTE_WINDOW } from "@/lib/constants";

/** Returns a YYYY-MM-DD string for today + offsetDays in Tasmania timezone. */
function getTasDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Hobart",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export interface AnnotatedCVFixture {
  id:           string;
  gradeName:    string;
  roundName:    string;
  matchDate:    string;
  homeTeamName: string;
  awayTeamName: string;
  venueName:    string | null;
  canVote:      boolean;
  blockReason:  string | null; // null when canVote is true
}

/**
 * GET /api/coaches-vote/fixtures?grade=...&teamName=...
 *
 * Returns ALL fixtures for the team (home or away, all rounds),
 * each annotated with `canVote` and `blockReason`.
 *
 * A game is eligible when:
 *   1. matchDate is today or yesterday (Tasmania time)
 *   2. No coaches vote has already been submitted by this team for this game
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const grade    = searchParams.get("grade")?.trim();
  const teamName = searchParams.get("teamName")?.trim();

  if (!grade || !teamName) {
    return NextResponse.json(
      { error: "grade and teamName are required." },
      { status: 400 }
    );
  }

  try {
    const today    = getTasDate(0);
    const earliest = getTasDate(-VOTE_WINDOW.daysAfterMatch);

    // All fixtures for this team — home or away, all rounds
    const allFixtures = await db
      .select()
      .from(fixtures)
      .where(
        and(
          eq(fixtures.gradeName, grade),
          or(
            eq(fixtures.homeTeamName, teamName),
            eq(fixtures.awayTeamName, teamName),
          ),
        )
      );

    if (allFixtures.length === 0) {
      return NextResponse.json({ fixtures: [], submittedGames: [] });
    }

    // Games this team has already voted on
    const submitted = await db
      .select({ round: coachesVotes.round, homeTeam: coachesVotes.homeTeam, awayTeam: coachesVotes.awayTeam })
      .from(coachesVotes)
      .where(
        and(
          eq(coachesVotes.grade,     grade),
          eq(coachesVotes.coachTeam, teamName),
        )
      );

    const votedKeys = new Set(submitted.map((v) => `${v.round}|${v.homeTeam}|${v.awayTeam}`));

    // Annotate every fixture with eligibility
    const annotated: AnnotatedCVFixture[] = allFixtures.map((f) => {
      const inWindow = !VOTE_WINDOW.enforce || (f.matchDate <= today && f.matchDate >= earliest);
      const alreadyVoted = votedKeys.has(`${f.roundName}|${f.homeTeamName}|${f.awayTeamName}`);

      let blockReason: string | null = null;
      if (!inWindow)      blockReason = `Outside voting window (within ${VOTE_WINDOW.daysAfterMatch} day(s) of match only)`;
      else if (alreadyVoted) blockReason = "Votes already submitted for this game";

      return { ...f, canVote: blockReason === null, blockReason };
    });

    // Sort: eligible first, then by match date ascending
    annotated.sort((a, b) => {
      if (a.canVote !== b.canVote) return a.canVote ? -1 : 1;
      return a.matchDate.localeCompare(b.matchDate);
    });

    const submittedGames = [...votedKeys];

    logger.info("[cv-fixtures] GET", { category: "api", grade, teamName, total: annotated.length });
    return NextResponse.json({ fixtures: annotated, submittedGames });
  } catch (e) {
    logger.error("[coaches-vote/fixtures] GET failed", { category: "api", error: String(e), grade, teamName });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
