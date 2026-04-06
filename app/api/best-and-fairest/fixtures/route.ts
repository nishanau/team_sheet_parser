import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixtures, bestAndFairest } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * GET /api/best-and-fairest/fixtures?grade=...&teamName=...
 *
 * Returns fixtures for the given grade where:
 *   - The team is either home or away
 *   - No BnF vote has been submitted yet for this team as homeTeam in that round
 *
 * Used by the BnF CodeGate to let a team pick an unvoted match.
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
    // All fixtures for this team (home or away)
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
      return NextResponse.json([]);
    }

    // Find rounds already voted for by this team (as homeTeam)
    const submitted = await db
      .select({ round: bestAndFairest.round, homeTeam: bestAndFairest.homeTeam })
      .from(bestAndFairest)
      .where(
        and(
          eq(bestAndFairest.grade,    grade),
          eq(bestAndFairest.homeTeam, teamName),
        )
      );

    const submittedRounds = new Set(submitted.map((s) => s.round));

    // Only return fixtures where this team is homeTeam and hasn't voted yet
    // (BnF is submitted by the home team only)
    const unvoted = allFixtures.filter(
      (f) => f.homeTeamName === teamName && !submittedRounds.has(f.roundName)
    );

    // Sort newest round first
    unvoted.sort((a, b) => b.roundName.localeCompare(a.roundName, undefined, { numeric: true }));

    logger.info("[bnf-fixtures] GET", { category: "api", grade, teamName, count: unvoted.length });
    return NextResponse.json(unvoted);
  } catch (err) {
    logger.error("[bnf-fixtures] GET failed", { category: "api", error: String(err) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
