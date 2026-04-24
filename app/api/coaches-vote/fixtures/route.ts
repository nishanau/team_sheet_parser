import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";

import { coachesVotes, fixtures } from "@/db/schema";
import { VOTE_WINDOW } from "@/lib/constants";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveVoteWindow } from "@/lib/voteWindow";

export interface AnnotatedCVFixture {
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
      return NextResponse.json({ fixtures: [], submittedGames: [] });
    }

    const submitted = await db
      .select({
        round: coachesVotes.round,
        homeTeam: coachesVotes.homeTeam,
        awayTeam: coachesVotes.awayTeam,
      })
      .from(coachesVotes)
      .where(
        and(
          eq(coachesVotes.grade, grade),
          eq(coachesVotes.coachTeam, teamName),
        ),
      );

    const votedKeys = new Set(submitted.map((v) => `${v.round}|${v.homeTeam}|${v.awayTeam}`));

    const annotated: AnnotatedCVFixture[] = await Promise.all(
      allFixtures.map(async (f) => {
        const { inWindow, extendedUntil } = await resolveVoteWindow(
          f.matchDate,
          "SFL",
          grade,
          f.roundName,
          f.id,
        );
        const alreadyVoted = votedKeys.has(`${f.roundName}|${f.homeTeamName}|${f.awayTeamName}`);

        let blockReason: string | null = null;
        if (!inWindow) {
          blockReason = extendedUntil
            ? `Voting window closed (was extended until ${extendedUntil})`
            : `Outside voting window (within ${VOTE_WINDOW.daysAfterMatch} day(s) of match only)`;
        } else if (alreadyVoted) {
          blockReason = "Votes already submitted for this game";
        }

        return { ...f, canVote: blockReason === null, blockReason };
      }),
    );

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
