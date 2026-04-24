import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, or } from "drizzle-orm";

import { bestAndFairest, fixtures } from "@/db/schema";
import { VOTE_WINDOW } from "@/lib/constants";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveVoteWindow } from "@/lib/voteWindow";

const SUBMISSION_LIMIT = 3;

export interface AnnotatedFixture {
  id: string;
  gradeName: string;
  roundName: string;
  matchDate: string;
  homeTeamName: string;
  awayTeamName: string;
  venueName: string | null;
  canVote: boolean;
  blockReason: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const grade = searchParams.get("grade")?.trim();
  const teamName = searchParams.get("teamName")?.trim();

  if (!grade || !teamName) {
    return NextResponse.json(
      { error: "grade and teamName are required." },
      { status: 400 },
    );
  }

  try {
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
        ),
      );

    if (allFixtures.length === 0) {
      return NextResponse.json({ fixtures: [], submittedByRound: {} });
    }

    const submittedRows = await db
      .select({ round: bestAndFairest.round, n: count() })
      .from(bestAndFairest)
      .where(eq(bestAndFairest.grade, grade))
      .groupBy(bestAndFairest.round);

    const submittedByRound: Record<string, number> = {};
    for (const row of submittedRows) submittedByRound[row.round] = row.n;

    const competition = grade.startsWith("SFL") ? "SFL" : "STJFL";

    const annotated: AnnotatedFixture[] = await Promise.all(
      allFixtures.map(async (f) => {
        const { inWindow, extendedUntil } = await resolveVoteWindow(
          f.matchDate,
          competition,
          grade,
          f.roundName,
          f.id,
        );
        const usedSlots = submittedByRound[f.roundName] ?? 0;
        const underCap = usedSlots < SUBMISSION_LIMIT;

        let blockReason: string | null = null;
        if (!inWindow) {
          blockReason = extendedUntil
            ? `Voting window closed (was extended until ${extendedUntil})`
            : `Outside voting window (within ${VOTE_WINDOW.daysAfterMatch} day(s) of match only)`;
        } else if (!underCap) {
          blockReason = `Maximum ${SUBMISSION_LIMIT} submissions already reached for this round`;
        }

        return { ...f, canVote: blockReason === null, blockReason };
      }),
    );

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
