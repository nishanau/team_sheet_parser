import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bestAndFairest, coachesVotes, fixtures } from "@/db/schema";
import { logger } from "@/lib/logger";

function fixturePairKey(round: string, matchDate: string, teamA: string | null, teamB: string | null) {
  return `${round}|${matchDate}|${[teamA ?? "", teamB ?? ""].sort().join("|")}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const grade = req.nextUrl.searchParams.get("grade") ?? "";
  if (!grade) return NextResponse.json({ bf: [], coaches: [] });

  try {
    const [bf, coaches, fixtureRows] = await Promise.all([
      db.select().from(bestAndFairest).where(eq(bestAndFairest.grade, grade)),
      db.select().from(coachesVotes).where(eq(coachesVotes.grade, grade)),
      db.select().from(fixtures).where(eq(fixtures.gradeName, grade)),
    ]);
    const fixturesByPair = new Map(
      fixtureRows.map((fixture) => [
        fixturePairKey(fixture.roundName, fixture.matchDate, fixture.homeTeamName, fixture.awayTeamName),
        fixture,
      ]),
    );
    const bfWithFixtureTeams = bf.map((submission) => {
      const fixture = fixturesByPair.get(
        fixturePairKey(submission.round, submission.matchDate, submission.submittingTeam, submission.opposition),
      );

      return {
        ...submission,
        fixtureHomeTeam: fixture?.homeTeamName ?? submission.submittingTeam ?? "",
        fixtureAwayTeam: fixture?.awayTeamName ?? submission.opposition,
      };
    });

    logger.info("[admin/votes] GET", { category: "api", grade });
    return NextResponse.json({ bf: bfWithFixtureTeams, coaches });
  } catch (err) {
    logger.error("[admin/votes] GET failed", { category: "api", error: String(err), grade });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
