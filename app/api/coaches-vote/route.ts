import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coachesVotes, teamAccessCodes } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ROUND_OPTIONS as ROUND_OPTIONS_ARR } from "@/lib/constants";
import { logger } from "@/lib/logger";

// Only these two grades are valid for Coaches Vote
export const COACHES_VOTE_GRADES = [
  "SFL Community League Senior Men",
  "SFL Community League Senior Women",
] as const;

const COACHES_VOTE_GRADE_SET = new Set<string>(COACHES_VOTE_GRADES);

const ROUND_OPTIONS = new Set(ROUND_OPTIONS_ARR);
const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE     = /^\d{1,4}$/;
const INITIALS_RE   = /^[A-Za-z]{1,5}$/;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function err(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

// ─── POST /api/coaches-vote ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try { body = await req.json(); } catch {
      return err("Invalid JSON body.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return err("Request body must be a JSON object.");
    }
    const b = body as Record<string, unknown>;

    // ── Required scalar fields ────────────────────────────────────────────────
    const accessCode    = str(b.accessCode,      9);  // XXXX-XXXX
    const grade         = str(b.grade,         200);
    const round         = str(b.round,          30);
    const matchDate     = str(b.matchDate,       10);
    const homeTeam      = str(b.homeTeam,       100);
    const awayTeam      = str(b.awayTeam,       100);
    const coachTeam     = str(b.coachTeam,      100);
    const submitterName = str(b.submitterName,  100);
    const initials      = str(b.signatureDataUrl, 5);

    if (!accessCode)    return err("accessCode is required.");
    if (!grade)         return err("grade is required.");
    if (!round)         return err("round is required.");
    if (!matchDate)     return err("matchDate is required.");
    if (!homeTeam)      return err("homeTeam is required.");
    if (!awayTeam)      return err("awayTeam is required.");
    if (!coachTeam)     return err("coachTeam is required.");
    if (!submitterName) return err("submitterName is required.");
    if (!initials)      return err("initials are required (max 5 chars).");

    // ── Format checks ─────────────────────────────────────────────────────────
    if (!DATE_RE.test(matchDate)) return err("matchDate must be YYYY-MM-DD.");
    if (isNaN(new Date(matchDate).getTime())) return err("matchDate is not a valid date.");
    if (!INITIALS_RE.test(initials)) return err("initials must be letters only (max 5).");

    // ── Date window: match day and the day after only (Tasmania time) ─────────
    const tasDate = (offsetDays = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Hobart",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(d);
    };
    const today     = tasDate(0);
    const yesterday = tasDate(-1);
    if (matchDate !== today && matchDate !== yesterday) {
      return NextResponse.json(
        { error: "Votes can only be submitted on match day or the day after." },
        { status: 422 }
      );
    }

    // ── Grade whitelist ───────────────────────────────────────────────────────
    if (!COACHES_VOTE_GRADE_SET.has(grade)) {
      return err(`Coaches Vote is only available for: ${COACHES_VOTE_GRADES.join(", ")}.`);
    }

    if (!ROUND_OPTIONS.has(round)) return err(`Unknown round: "${round}".`);

    // ── Access code verification ──────────────────────────────────────────────
    const [codeRow] = await db
      .select({ teamName: teamAccessCodes.teamName, gradeName: teamAccessCodes.gradeName })
      .from(teamAccessCodes)
      .where(
        and(
          eq(teamAccessCodes.code,   accessCode.toUpperCase()),
          eq(teamAccessCodes.active, true),
        )
      )
      .limit(1);

    if (!codeRow) {
      return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
    }
    // Code must match the submitting team
    if (codeRow.teamName !== coachTeam || codeRow.gradeName !== grade) {
      return NextResponse.json(
        { error: "Access code does not match the selected team and grade." },
        { status: 401 }
      );
    }

    if (homeTeam === awayTeam) return err("Home team and away team cannot be the same.");

    // ── Player rows ───────────────────────────────────────────────────────────
    const playerFields = [1, 2, 3, 4, 5].map((n) => {
      const num  = str(b[`player${n}Number`], 4);
      const name = str(b[`player${n}Name`],  100);
      if (!num)  return { error: `player${n}Number is required.` };
      if (!name) return { error: `player${n}Name is required.` };
      if (!NUMBER_RE.test(num)) return { error: `player${n}Number must be numeric (1–4 digits).` };
      return { num, name };
    });

    for (const p of playerFields) {
      if ("error" in p) return err(p.error!);
    }

    const [p1, p2, p3, p4, p5] = playerFields as { num: string; name: string }[];

    // Duplicate player number check
    const nums = [p1, p2, p3, p4, p5].map((p) => p.num);
    if (new Set(nums).size !== nums.length) {
      return err("Duplicate player numbers are not allowed.");
    }

    // ── One submission per coach team per game ────────────────────────────────
    // "No auth" deduplication: keyed on (grade, round, homeTeam, awayTeam, coachTeam).
    // A coach team can only submit once per game.
    const existing = await db
      .select({ id: coachesVotes.id })
      .from(coachesVotes)
      .where(
        and(
          eq(coachesVotes.grade,     grade),
          eq(coachesVotes.round,     round),
          eq(coachesVotes.homeTeam,  homeTeam),
          eq(coachesVotes.awayTeam,  awayTeam),
          eq(coachesVotes.coachTeam, coachTeam),
        )
      );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Votes for ${coachTeam} in this game have already been submitted. Only one submission per team per game is allowed.` },
        { status: 409 }
      );
    }

    // ── Insert ────────────────────────────────────────────────────────────────
    const [inserted] = await db
      .insert(coachesVotes)
      .values({
        grade, round, matchDate,
        homeTeam, awayTeam, coachTeam,
        player1Number: p1.num, player1Name: p1.name,
        player2Number: p2.num, player2Name: p2.name,
        player3Number: p3.num, player3Name: p3.name,
        player4Number: p4.num, player4Name: p4.name,
        player5Number: p5.num, player5Name: p5.name,
        submitterName,
        signatureDataUrl: initials,
      })
      .returning();

    logger.info("[coaches-vote] vote submitted", {
      category: "business",
      grade,
      round,
      homeTeam,
      awayTeam,
      coachTeam,
    });

    return NextResponse.json({ success: true, id: inserted.id }, { status: 201 });
  } catch (e) {
    logger.error("[coaches-vote] POST failed", { category: "api", error: String(e) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── GET /api/coaches-vote ────────────────────────────────────────────────────
export async function GET() {
  try {
    const records = await db
      .select()
      .from(coachesVotes)
      .orderBy(desc(coachesVotes.createdAt));
    return NextResponse.json(records);
  } catch (e) {
    logger.error("[coaches-vote] GET failed", { category: "api", error: String(e) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
