import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { teamAccessCodes, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
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
    })
    .from(teamAccessCodes)
    .orderBy(teamAccessCodes.gradeName, teamAccessCodes.teamName);

  if (session.user.role === "club_admin") {
    return NextResponse.json([], { status: 403 });
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
    const [codeRow] = await db
      .select({ teamName: teamAccessCodes.teamName })
      .from(teamAccessCodes)
      .where(eq(teamAccessCodes.id, id))
      .limit(1);
    if (!codeRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [teamRow] = await db
      .select({ clubId: teams.clubId })
      .from(teams)
      .where(eq(teams.name, codeRow.teamName))
      .limit(1);
    if (teamRow?.clubId !== session.user.clubId) {
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
