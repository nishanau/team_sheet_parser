import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixtures, bestAndFairest } from "@/db/schema";
import { and, eq, or, count } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { VOTE_WINDOW } from "@/lib/constants";

const SUBMISSION_LIMIT = 3;

/** Returns a YYYY-MM-DD string for today + offsetDays in Tasmania timezone. */
function getTasDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Hobart",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export interface AnnotatedFixture {
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
 * GET /api/best-and-fairest/fixtures?grade=...&teamName=...
 *
 * Returns ALL fixtures for the team (home or away, all rounds),
 * each annotated with `canVote` and `blockReason` so the UI can
 * show the full schedule but disable ineligible games.
 *
 * A game is eligible to vote on when:
 *   1. matchDate is today or yesterday (Tasmania time)
 *   2. submissions for this team + round are below the cap (3)
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
      return NextResponse.json({ fixtures: [], submittedByRound: {} });
    }

    // Count total submissions per round across all teams (global cap of 3 per round)
    const submittedRows = await db
      .select({ round: bestAndFairest.round, n: count() })
      .from(bestAndFairest)
      .where(eq(bestAndFairest.grade, grade))
      .groupBy(bestAndFairest.round);

    const submittedByRound: Record<string, number> = {};
    for (const row of submittedRows) submittedByRound[row.round] = row.n;

    // Annotate every fixture with eligibility
    const annotated: AnnotatedFixture[] = allFixtures.map((f) => {
      const inWindow  = !VOTE_WINDOW.enforce || (f.matchDate <= today && f.matchDate >= earliest);
      const usedSlots = submittedByRound[f.roundName] ?? 0;
      const underCap  = usedSlots < SUBMISSION_LIMIT;

      let blockReason: string | null = null;
      if (!inWindow)       blockReason = `Outside voting window (within ${VOTE_WINDOW.daysAfterMatch} day(s) of match only)`;
      else if (!underCap)  blockReason = `Maximum ${SUBMISSION_LIMIT} submissions already reached for this round`;

      return { ...f, canVote: blockReason === null, blockReason };
    });

    // Sort: eligible first, then by match date ascending (earliest first)
    annotated.sort((a, b) => {
      if (a.canVote !== b.canVote) return a.canVote ? -1 : 1;
      return a.matchDate.localeCompare(b.matchDate);
    });

    logger.info("[bnf-fixtures] GET", { category: "api", grade, teamName, total: annotated.length });
    return NextResponse.json({ fixtures: annotated, submittedByRound });
  } catch (err) {
    logger.error("[bnf-fixtures] GET failed", { category: "api", error: String(err) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
