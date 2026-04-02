import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { adminUsers, clubs } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Only superadmin can call any of these endpoints
async function requireSuperadmin() {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") return false;
  return true;
}

// GET /api/admin/users — list all club_admin users with club name
export async function GET() {
  if (!(await requireSuperadmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      id:       adminUsers.id,
      username: adminUsers.username,
      role:     adminUsers.role,
      clubId:   adminUsers.clubId,
      clubName: clubs.name,
    })
    .from(adminUsers)
    .leftJoin(clubs, eq(adminUsers.clubId, clubs.id))
    .orderBy(adminUsers.username);

  return NextResponse.json(rows);
}

// POST /api/admin/users — create a club_admin
// Body: { username, password, clubId }
export async function POST(req: NextRequest) {
  if (!(await requireSuperadmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { username, password, clubId } = await req.json() as {
    username?: string; password?: string; clubId?: number;
  };

  if (!username?.trim() || !password || !clubId)
    return NextResponse.json({ error: "username, password and clubId are required" }, { status: 400 });

  // Enforce one club_admin per club
  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(and(eq(adminUsers.clubId, clubId), eq(adminUsers.role, "club_admin")))
    .limit(1);

  if (existing.length > 0)
    return NextResponse.json({ error: "This club already has an admin. Delete or update the existing one first." }, { status: 409 });

  // Check username uniqueness
  const taken = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.username, username.trim()))
    .limit(1);

  if (taken.length > 0)
    return NextResponse.json({ error: "Username already taken." }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(adminUsers)
    .values({ username: username.trim(), passwordHash, role: "club_admin", clubId })
    .returning({ id: adminUsers.id, username: adminUsers.username, role: adminUsers.role, clubId: adminUsers.clubId });

  return NextResponse.json(created, { status: 201 });
}

// PATCH /api/admin/users — update username and/or password for a club_admin
// Body: { id, username?, password?, clubId? }
export async function PATCH(req: NextRequest) {
  if (!(await requireSuperadmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, username, password, clubId } = await req.json() as {
    id?: number; username?: string; password?: string; clubId?: number;
  };

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Fetch current user to validate it's a club_admin
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.role === "superadmin")
    return NextResponse.json({ error: "Cannot modify superadmin via this endpoint." }, { status: 403 });

  // If changing club, check one-admin-per-club constraint
  const targetClubId = clubId ?? user.clubId;
  if (clubId && clubId !== user.clubId) {
    const conflict = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(eq(adminUsers.clubId, clubId), eq(adminUsers.role, "club_admin"), ne(adminUsers.id, id)))
      .limit(1);
    if (conflict.length > 0)
      return NextResponse.json({ error: "That club already has an admin." }, { status: 409 });
  }

  // If changing username, check uniqueness
  if (username?.trim()) {
    const taken = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(eq(adminUsers.username, username.trim()), ne(adminUsers.id, id)))
      .limit(1);
    if (taken.length > 0)
      return NextResponse.json({ error: "Username already taken." }, { status: 409 });
  }

  const updates: Partial<typeof adminUsers.$inferInsert> = {};
  if (username?.trim())  updates.username     = username.trim();
  if (password)          updates.passwordHash = await bcrypt.hash(password, 10);
  if (targetClubId)      updates.clubId       = targetClubId;

  const [updated] = await db
    .update(adminUsers)
    .set(updates)
    .where(eq(adminUsers.id, id))
    .returning({ id: adminUsers.id, username: adminUsers.username, role: adminUsers.role, clubId: adminUsers.clubId });

  return NextResponse.json(updated);
}

// DELETE /api/admin/users?id=123
export async function DELETE(req: NextRequest) {
  if (!(await requireSuperadmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.role === "superadmin")
    return NextResponse.json({ error: "Cannot delete a superadmin." }, { status: 403 });

  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  return NextResponse.json({ ok: true });
}
