import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamAccessCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

// ─── POST /api/coaches-vote/verify ───────────────────────────────────────────
// Body: { accessCode: string }
// Returns: { teamName, gradeName } on success, 401 on invalid code
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { accessCode } = body as Record<string, unknown>;
  if (typeof accessCode !== "string" || !accessCode.trim()) {
    return NextResponse.json({ error: "accessCode is required." }, { status: 400 });
  }

  const code = accessCode.trim().toUpperCase();

  try {
    const [row] = await db
      .select({
        teamName:  teamAccessCodes.teamName,
        gradeName: teamAccessCodes.gradeName,
      })
      .from(teamAccessCodes)
      .where(
        and(
          eq(teamAccessCodes.code,   code),
          eq(teamAccessCodes.active, true),
        )
      )
      .limit(1);

    if (!row) {
      logger.warn("[coaches-vote/verify] invalid code", { category: "auth" });
      return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
    }

    logger.info("[coaches-vote/verify] code verified", { category: "auth", teamName: row.teamName, gradeName: row.gradeName });
    return NextResponse.json({ teamName: row.teamName, gradeName: row.gradeName });
  } catch (e) {
    logger.error("[coaches-vote/verify] POST failed", { category: "api", error: String(e) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
