import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bestAndFairest, leagues, teamAccessCodes, teamPlayers } from "@/db/schema";
import { and, eq, desc, count } from "drizzle-orm";
import { ROUND_OPTIONS as ROUND_OPTIONS_ARR, AGE_GROUPS, GRADE_MAP } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { toTitleCase } from "@/lib/utils";

// ─── Validation constants ─────────────────────────────────────────────────────
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE   = /^\d{1,4}$/;
const INITIALS_RE = /^[A-Za-z]{1,5}$/;

const ROUND_OPTIONS = new Set(ROUND_OPTIONS_ARR);

/** Returns today's date string in Tasmania timezone (YYYY-MM-DD). */
function getTasDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Hobart",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function err(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    let body: unknown;
    try { body = await req.json(); } catch {
      return err("Invalid JSON body.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return err("Request body must be a JSON object.");
    }
    const b = body as Record<string, unknown>;

    // ── Required scalar fields ────────────────────────────────────────────────
    const accessCode    = str(b.accessCode,       9);  // XXXX-XXXX — re-validated server-side
    const competition   = str(b.competition,      50);
    const matchDate     = str(b.matchDate,         10);
    const ageGroup      = str(b.ageGroup,          50);
    const grade         = str(b.grade,            200); // nullable for STJFL
    const homeTeam      = str(b.homeTeam,         100);
    const opposition    = str(b.opposition,       100);
    const round         = str(b.round,             30);
    const submitterName = str(b.submitterName,    100);
    const initials      = str(b.signatureDataUrl,   5); // stored in signatureDataUrl column

    if (!accessCode)    return err("accessCode is required.");
    if (!competition)   return err("competition is required.");
    if (!matchDate)     return err("matchDate is required.");
    if (!ageGroup)      return err("ageGroup is required.");
    if (!homeTeam)      return err("homeTeam is required.");
    if (!opposition)    return err("opposition is required.");
    if (!round)         return err("round is required.");
    if (!submitterName) return err("submitterName is required.");
    if (!initials)      return err("initials are required (max 5 chars).");

    // ── Format checks ─────────────────────────────────────────────────────────
    if (!DATE_RE.test(matchDate)) return err("matchDate must be YYYY-MM-DD.");
    if (isNaN(new Date(matchDate).getTime())) return err("matchDate is not a valid date.");
    if (!INITIALS_RE.test(initials)) return err("initials must be letters only (max 5).");

    // ── Whitelist checks ──────────────────────────────────────────────────────
    const [leagueRow] = await db.select().from(leagues).where(eq(leagues.name, competition)).limit(1);
    if (!leagueRow) return err(`Unknown competition: "${competition}".`);

    const allowedAgeGroups = AGE_GROUPS[competition] ?? [];
    if (!allowedAgeGroups.includes(ageGroup)) {
      return err(`Unknown age group "${ageGroup}" for competition "${competition}".`);
    }

    const gradeKey      = `${competition}::${ageGroup}`;
    const allowedGrades = GRADE_MAP[gradeKey] ?? [];
    if (competition === "SFL") {
      if (!grade) return err("grade is required for SFL competitions.");
      if (!allowedGrades.includes(grade)) {
        return err(`Unknown grade "${grade}" for ${competition} ${ageGroup}.`);
      }
    }

    if (!ROUND_OPTIONS.has(round)) return err(`Unknown round: "${round}".`);

    if (homeTeam === opposition) return err("Home team and opposition cannot be the same.");

    // ── Access code re-validation ─────────────────────────────────────────────
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

    // submittingTeam = the team identified by the access code
    const submittingTeam = codeRow.teamName;

    // For SFL: code must match grade exactly
    if (competition === "SFL") {
      if (codeRow.gradeName !== grade) {
        return NextResponse.json(
          { error: "Access code does not match the selected grade." },
          { status: 401 }
        );
      }
    }


    // ── Match date window: today or tomorrow (Tasmania time) ────────────────
    const today     = getTasDate(0);
    const yesterday = getTasDate(-1);
    if (matchDate !== today && matchDate !== yesterday) {
      return NextResponse.json(
        { error: "Votes can only be submitted for matches played today or yesterday." },
        { status: 422 }
      );
    }

    // ── Max 3 submissions per team per round ──────────────────────────────────
    const SUBMISSION_LIMIT = 3;
    const [countRow] = await db
      .select({ n: count() })
      .from(bestAndFairest)
      .where(
        and(
          eq(bestAndFairest.competition, competition),
          eq(bestAndFairest.grade,       grade ?? ""),
          eq(bestAndFairest.round,       round),
          eq(bestAndFairest.homeTeam, submittingTeam),
        )
      );

    if ((countRow?.n ?? 0) >= SUBMISSION_LIMIT) {
      return NextResponse.json(
        { error: `${submittingTeam} has already submitted the maximum ${SUBMISSION_LIMIT} votes for ${round}.` },
        { status: 409 }
      );
    }

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

    const nums = [p1, p2, p3, p4, p5].map((p) => p.num);
    if (new Set(nums).size !== nums.length) {
      return err("Duplicate player numbers are not allowed.");
    }

    // ── Players must be from the submitting team's roster ────────────────────
    const rosterRows = await db
      .select({
        playerNumber: teamPlayers.playerNumber,
        firstName:    teamPlayers.firstName,
        lastName:     teamPlayers.lastName,
      })
      .from(teamPlayers)
      .where(eq(teamPlayers.teamName, submittingTeam));

    if (rosterRows.length > 0) {
      const rosterNums = new Set(rosterRows.map((r) => r.playerNumber).filter(Boolean) as string[]);
      const outsiders  = nums.filter((n) => !rosterNums.has(n));
      if (outsiders.length > 0) {
        return NextResponse.json(
          { error: `Player number${outsiders.length > 1 ? "s" : ""} ${outsiders.join(", ")} are not on ${submittingTeam}'s roster. You may only vote for your own team's players.` },
          { status: 422 }
        );
      }
    }

    // ── Name check ───────────────────────────────────────────────────────────
    // If the roster has data, the submitted name must match the stored name for
    // the given number. Players with no stored name are skipped (data quality gap).
    if (rosterRows.length > 0) {
      const rosterByNumber = new Map<string, Set<string>>();
      for (const r of rosterRows) {
        if (!r.playerNumber) continue;
        if (!rosterByNumber.has(r.playerNumber)) rosterByNumber.set(r.playerNumber, new Set());
        const fullName = `${r.firstName} ${r.lastName}`.trim();
        if (fullName) rosterByNumber.get(r.playerNumber)!.add(toTitleCase(fullName));
      }
      for (const p of [p1, p2, p3, p4, p5]) {
        const validNames = rosterByNumber.get(p.num);
        if (!validNames || validNames.size === 0) continue;
        if (!validNames.has(toTitleCase(p.name))) {
          return NextResponse.json(
            { error: `Player #${p.num} name does not match the team roster.` },
            { status: 422 }
          );
        }
      }
    }

    // ── Insert ────────────────────────────────────────────────────────────────
    const [inserted] = await db
      .insert(bestAndFairest)
      .values({
        competition, matchDate, ageGroup,
        grade:      grade ?? null,
        homeTeam:   submittingTeam,
        opposition, round,
        player1Number: p1.num, player1Name: toTitleCase(p1.name),
        player2Number: p2.num, player2Name: toTitleCase(p2.name),
        player3Number: p3.num, player3Name: toTitleCase(p3.name),
        player4Number: p4.num, player4Name: toTitleCase(p4.name),
        player5Number: p5.num, player5Name: toTitleCase(p5.name),
        submitterName,
        signatureDataUrl: initials,
      })
      .returning();

    logger.info("[best-and-fairest] vote submitted", {
      category: "business",
      grade, round, submittingTeam, opposition,
    });

    return NextResponse.json({ success: true, id: inserted.id }, { status: 201 });
  } catch (e) {
    logger.error("[best-and-fairest] POST failed", { category: "api", error: String(e) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const records = await db
      .select()
      .from(bestAndFairest)
      .orderBy(desc(bestAndFairest.createdAt));
    return NextResponse.json(records);
  } catch (err) {
    logger.error("[best-and-fairest] GET failed", { category: "api", error: String(err) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
