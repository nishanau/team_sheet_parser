import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "superadmin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({ id: clubs.id, name: clubs.name })
    .from(clubs)
    .orderBy(asc(clubs.name));

  return NextResponse.json(rows);
}
