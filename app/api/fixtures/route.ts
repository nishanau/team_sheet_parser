import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, SQL } from "drizzle-orm";

import { fixtures } from "@/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const grade = searchParams.get("grade")?.trim();
  const homeTeam = searchParams.get("homeTeam")?.trim();
  const round = searchParams.get("round")?.trim();

  if (!grade) {
    return NextResponse.json(
      { error: "grade query param is required." },
      { status: 400 },
    );
  }

  try {
    logger.info("[fixtures] GET", { category: "api", grade, homeTeam: homeTeam ?? null, round: round ?? null });

    const conditions: SQL[] = [eq(fixtures.gradeName, grade)];
    if (homeTeam) conditions.push(eq(fixtures.homeTeamName, homeTeam));
    if (round) conditions.push(eq(fixtures.roundName, round));

    const rows = await db
      .select()
      .from(fixtures)
      .where(and(...conditions))
      .orderBy(asc(fixtures.matchDate));

    return NextResponse.json(rows);
  } catch (err) {
    logger.error("[fixtures] GET failed", { category: "api", error: String(err), grade, homeTeam, round });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
