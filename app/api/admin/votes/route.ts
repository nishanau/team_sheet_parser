import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bestAndFairest, coachesVotes } from "@/db/schema";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const grade = req.nextUrl.searchParams.get("grade") ?? "";
  if (!grade) return NextResponse.json({ bf: [], coaches: [] });

  try {
    const [bf, coaches] = await Promise.all([
      db.select().from(bestAndFairest).where(eq(bestAndFairest.grade, grade)),
      db.select().from(coachesVotes).where(eq(coachesVotes.grade, grade)),
    ]);
    logger.info("[admin/votes] GET", { category: "api", grade });
    return NextResponse.json({ bf, coaches });
  } catch (err) {
    logger.error("[admin/votes] GET failed", { category: "api", error: String(err), grade });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
