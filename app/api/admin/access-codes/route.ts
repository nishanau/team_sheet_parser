import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { teamAccessCodes, teams } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf   = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[buf[i] % chars.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id:        teamAccessCodes.id,
      teamName:  teamAccessCodes.teamName,
      gradeName: teamAccessCodes.gradeName,
      code:      teamAccessCodes.code,
      active:    teamAccessCodes.active,
      clubId:    teams.clubId,
    })
    .from(teamAccessCodes)
    .leftJoin(teams, and(eq(teams.name, teamAccessCodes.teamName), eq(teams.gradeName, teamAccessCodes.gradeName)))
    .orderBy(teamAccessCodes.gradeName, teamAccessCodes.teamName);

  if (session.user.role === "club_admin") {
    return NextResponse.json(rows.filter((r) => r.clubId === session.user.clubId));
  }
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json() as { id: number; action: "regenerate" | "toggle" };
  const { id, action } = body;

  // Scope check for club_admin
  if (session.user.role === "club_admin") {
    const [row] = await db
      .select({ clubId: teams.clubId })
      .from(teamAccessCodes)
      .leftJoin(teams, and(eq(teams.name, teamAccessCodes.teamName), eq(teams.gradeName, teamAccessCodes.gradeName)))
      .where(eq(teamAccessCodes.id, id))
      .limit(1);
    if (row?.clubId !== session.user.clubId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (action === "regenerate") {
    const newCode = genCode();
    await db.update(teamAccessCodes).set({ code: newCode }).where(eq(teamAccessCodes.id, id));
    return NextResponse.json({ code: newCode });
  }

  if (action === "toggle") {
    const [current] = await db.select({ active: teamAccessCodes.active }).from(teamAccessCodes).where(eq(teamAccessCodes.id, id)).limit(1);
    await db.update(teamAccessCodes).set({ active: !current.active }).where(eq(teamAccessCodes.id, id));
    return NextResponse.json({ active: !current.active });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
