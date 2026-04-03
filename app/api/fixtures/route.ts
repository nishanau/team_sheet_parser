import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixtures } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * GET /api/fixtures?grade=...&homeTeam=...&round=...
 *
 * Returns fixtures matching grade + homeTeam, optionally filtered by round.
 * Used by the Best & Fairest form to auto-fill Opposition.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const grade    = searchParams.get("grade")?.trim();
  const homeTeam = searchParams.get("homeTeam")?.trim();
  const round    = searchParams.get("round")?.trim();

  if (!grade || !homeTeam) {
    return NextResponse.json(
      { error: "grade and homeTeam query params are required." },
      { status: 400 }
    );
  }

  try {
    const conditions = [
      eq(fixtures.gradeName, grade),
      eq(fixtures.homeTeamName, homeTeam),
    ];
    if (round) conditions.push(eq(fixtures.roundName, round));

    const rows = await db
      .select()
      .from(fixtures)
      .where(and(...conditions))
      .orderBy(asc(fixtures.matchDate));

    return NextResponse.json(rows);
  } catch (err) {
    logger.error("[fixtures] GET failed", { error: String(err), grade, homeTeam, round });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
