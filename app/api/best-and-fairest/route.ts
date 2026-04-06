import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bestAndFairest, leagues, teams, teamAccessCodes } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ROUND_OPTIONS as ROUND_OPTIONS_ARR, AGE_GROUPS, GRADE_MAP, STJFL_TEAMS } from "@/lib/constants";
import { logger } from "@/lib/logger";

// ─── Validation constants ─────────────────────────────────────────────────────
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE   = /^\d{1,4}$/;
const INITIALS_RE = /^[A-Za-z]{1,5}$/;

const ROUND_OPTIONS = new Set(ROUND_OPTIONS_ARR);

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

    // Team list: SFL from DB, STJFL hardcoded
    let knownTeamNames: Set<string>;
    if (competition === "SFL" && grade) {
      const gradeTeams = await db
        .select()
        .from(teams)
        .where(and(eq(teams.leagueId, leagueRow.id), eq(teams.gradeName, grade)));
      knownTeamNames = new Set(gradeTeams.map((t) => t.name));
    } else {
      knownTeamNames = new Set(STJFL_TEAMS);
    }

    if (!knownTeamNames.has(homeTeam))  return err(`Unknown home team: "${homeTeam}".`);
    if (!knownTeamNames.has(opposition)) return err(`Unknown opposition: "${opposition}".`);
    if (homeTeam === opposition)         return err("Home team and opposition cannot be the same.");

    // ── Access code re-validation ─────────────────────────────────────────────
    // The code is re-checked on every submission so a deactivated code is rejected
    // even if the browser still has an unexpired session.
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

    // For SFL grades: code must match homeTeam + grade exactly
    // For STJFL: grade column is null on the form, so we only check teamName
    if (competition === "SFL") {
      if (codeRow.teamName !== homeTeam || codeRow.gradeName !== grade) {
        return NextResponse.json(
          { error: "Access code does not match the selected team and grade." },
          { status: 401 }
        );
      }
    } else {
      if (codeRow.teamName !== homeTeam) {
        return NextResponse.json(
          { error: "Access code does not match the selected team." },
          { status: 401 }
        );
      }
    }

    // ── Per-game deduplication (one submission per homeTeam per game) ─────────
    const [existing] = await db
      .select({ id: bestAndFairest.id })
      .from(bestAndFairest)
      .where(
        and(
          eq(bestAndFairest.competition, competition),
          eq(bestAndFairest.grade,       grade ?? ""),
          eq(bestAndFairest.round,       round),
          eq(bestAndFairest.homeTeam,    homeTeam),
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: `Votes for ${homeTeam} in Round ${round} have already been submitted.` },
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

    // ── Insert ────────────────────────────────────────────────────────────────
    const [inserted] = await db
      .insert(bestAndFairest)
      .values({
        competition, matchDate, ageGroup,
        grade:      grade ?? null,
        homeTeam,
        opposition, round,
        player1Number: p1.num, player1Name: p1.name,
        player2Number: p2.num, player2Name: p2.name,
        player3Number: p3.num, player3Name: p3.name,
        player4Number: p4.num, player4Name: p4.name,
        player5Number: p5.num, player5Name: p5.name,
        submitterName,
        signatureDataUrl: initials,
      })
      .returning();

    logger.info("[best-and-fairest] vote submitted", {
      category: "business",
      grade, round, homeTeam, opposition,
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
