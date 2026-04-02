import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bestAndFairest, coachesVotes, teams } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find B&F duplicates: same (competition, grade, round, home_team) > 1 submission
  const bfDupes = await db
    .select({
      type:      sql<string>`'bf'`.as("type"),
      grade:     bestAndFairest.grade,
      round:     bestAndFairest.round,
      team:      bestAndFairest.homeTeam,
      count:     sql<number>`COUNT(*)`.as("count"),
      firstDate: sql<string>`MIN(created_at)`.as("firstDate"),
      lastDate:  sql<string>`MAX(created_at)`.as("lastDate"),
    })
    .from(bestAndFairest)
    .groupBy(bestAndFairest.competition, bestAndFairest.grade, bestAndFairest.round, bestAndFairest.homeTeam)
    .having(sql`COUNT(*) > 1`);

  // Find Coaches Vote duplicates: same (grade, round, coach_team) > 1 submission
  const cvDupes = session.user.role === "superadmin"
    ? await db
        .select({
          type:      sql<string>`'coaches'`.as("type"),
          grade:     coachesVotes.grade,
          round:     coachesVotes.round,
          team:      coachesVotes.coachTeam,
          count:     sql<number>`COUNT(*)`.as("count"),
          firstDate: sql<string>`MIN(created_at)`.as("firstDate"),
          lastDate:  sql<string>`MAX(created_at)`.as("lastDate"),
        })
        .from(coachesVotes)
        .groupBy(coachesVotes.grade, coachesVotes.round, coachesVotes.coachTeam)
        .having(sql`COUNT(*) > 1`)
    : [];

  let alerts = [...bfDupes, ...cvDupes];

  // Scope club_admin to their teams
  if (session.user.role === "club_admin" && session.user.clubId) {
    const clubTeams = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.clubId, session.user.clubId));
    const nameSet = new Set(clubTeams.map((t) => t.name));
    alerts = alerts.filter((a) => nameSet.has(a.team ?? ""));
  }

  return NextResponse.json(alerts);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, type } = await req.json() as { id: number; type: "bf" | "coaches" };

  if (type === "bf") {
    await db.delete(bestAndFairest).where(eq(bestAndFairest.id, id));
  } else {
    await db.delete(coachesVotes).where(eq(coachesVotes.id, id));
  }

  return NextResponse.json({ ok: true });
}
