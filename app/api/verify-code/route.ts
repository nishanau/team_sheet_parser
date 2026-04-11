import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamAccessCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { BNF_GRADES, CV_GRADES } from "@/lib/constants";

/**
 * POST /api/verify-code
 * Shared endpoint used by both Best & Fairest and Coaches Vote gates.
 *
 * Body:  { accessCode: string, formType: "bnf" | "cv" }
 * Returns: { teamName, gradeName } on success
 *          { error } with status 401 on invalid/inactive code
 *          { error } with status 403 if the grade is not eligible for this form
 */

// ── Handler ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { accessCode, formType } = body as Record<string, unknown>;
  if (typeof accessCode !== "string" || !accessCode.trim()) {
    return NextResponse.json({ error: "accessCode is required." }, { status: 400 });
  }
  if (formType !== "bnf" && formType !== "cv") {
    return NextResponse.json({ error: "formType must be \"bnf\" or \"cv\"." }, { status: 400 });
  }

  const code      = accessCode.trim().toUpperCase();
  const allowlist = formType === "bnf" ? BNF_GRADES : CV_GRADES;

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
      logger.warn("[verify-code] invalid or inactive code", { category: "auth" });
      return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
    }

    // Enforce grade allowlist — prevent a BnF code being used on the CV form and vice-versa
    if (!allowlist.has(row.gradeName ?? "")) {
      logger.warn("[verify-code] grade not eligible for form", {
        category: "auth",
        formType,
        gradeName: row.gradeName,
      });
      return NextResponse.json(
        { error: "This access code is not valid for this form." },
        { status: 403 }
      );
    }

    logger.info("[verify-code] code verified", {
      category: "auth",
      teamName:  row.teamName,
      gradeName: row.gradeName,
    });

    return NextResponse.json({ teamName: row.teamName, gradeName: row.gradeName });
  } catch (e) {
    logger.error("[verify-code] failed", { category: "api", error: String(e) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
