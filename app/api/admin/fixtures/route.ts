import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { fixtures } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = req.nextUrl;
  const grade = searchParams.get("grade");
  const round = searchParams.get("round");

  const filters = [
    ...(grade ? [eq(fixtures.gradeName, grade)] : []),
    ...(round ? [eq(fixtures.roundName, round)] : []),
  ];

  const rows = await db
    .select()
    .from(fixtures)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(fixtures.gradeName, fixtures.roundName, fixtures.matchDate)
    .limit(500);

  return NextResponse.json(rows);
}
