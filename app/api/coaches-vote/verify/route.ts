import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamAccessCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

// Simple in-memory rate limiter: 10 attempts per IP per 15 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS    = 15 * 60 * 1000;

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now  = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true; // allowed
  }
  if (entry.count >= MAX_ATTEMPTS) return false; // blocked
  entry.count += 1;
  return true;
}

// ─── POST /api/coaches-vote/verify ───────────────────────────────────────────
// Body: { accessCode: string }
// Returns: { teamName, gradeName } on success, 401 on invalid code
export async function POST(req: NextRequest) {
  const ip = getIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

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
      return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
    }

    return NextResponse.json({ teamName: row.teamName, gradeName: row.gradeName });
  } catch (e) {
    logger.error("[coaches-vote/verify] POST failed", { error: String(e) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
