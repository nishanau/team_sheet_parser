import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixtures, coachesVotes } from "@/db/schema";
import { and, eq, /* lte, */ or } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * GET /api/coaches-vote/fixtures?grade=...&teamName=...
 *
 * Returns fixtures for the given grade where:
 *   - The team is either home or away
 *   - [TEMPORARILY DISABLED] match_date <= today (Tasmanian time)
 *   - No coaches vote has been submitted for this game by this team yet
 *
 * Results ordered newest first.
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

  // // Today in Tasmanian time (YYYY-MM-DD) — disabled for testing
  // const today = new Intl.DateTimeFormat("en-CA", {
  //   timeZone: "Australia/Hobart",
  //   year: "numeric", month: "2-digit", day: "2-digit",
  // }).format(new Date());

  try {
    // All fixtures for this team (home or away) — date filter disabled for testing
    const played = await db
      .select()
      .from(fixtures)
      .where(
        and(
          eq(fixtures.gradeName, grade),
          // lte(fixtures.matchDate, today), // re-enable to restrict to past matches
          or(
            eq(fixtures.homeTeamName, teamName),
            eq(fixtures.awayTeamName, teamName),
          ),
        )
      );

    // Votes already submitted for this team in this grade
    const submitted = await db
      .select({
        homeTeam:  coachesVotes.homeTeam,
        awayTeam:  coachesVotes.awayTeam,
        round:     coachesVotes.round,
      })
      .from(coachesVotes)
      .where(
        and(
          eq(coachesVotes.grade,     grade),
          eq(coachesVotes.coachTeam, teamName),
        )
      );

    // Build a set of already-voted game keys: "round|home|away"
    const votedKeys = new Set(
      submitted.map((v) => `${v.round}|${v.homeTeam}|${v.awayTeam}`)
    );

    // Filter out games already voted on, sort newest first
    const available = played
      .filter((f) => !votedKeys.has(`${f.roundName}|${f.homeTeamName}|${f.awayTeamName}`))
      .sort((a, b) => b.matchDate.localeCompare(a.matchDate));

    return NextResponse.json(available);
  } catch (e) {
    logger.error("[coaches-vote/fixtures] GET failed", { category: "api", error: String(e), grade, teamName });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
