import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";

import { bestAndFairest, fixtures, leagues, teamAccessCodes, teamPlayers } from "@/db/schema";
import { AGE_GROUPS, GRADE_MAP, ROUND_OPTIONS as ROUND_OPTIONS_ARR, VOTE_WINDOW } from "@/lib/constants";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { toTitleCase } from "@/lib/utils";
import { resolveVoteWindow } from "@/lib/voteWindow";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE = /^\d{1,4}$/;
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
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err("Invalid JSON body.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return err("Request body must be a JSON object.");
    }
    const b = body as Record<string, unknown>;

    const accessCode      = str(b.accessCode, 9);
    const competition     = str(b.competition, 50);
    const matchDate       = str(b.matchDate, 10);
    const ageGroup        = str(b.ageGroup, 50);
    const grade           = str(b.grade, 200);
    const fixtureId       = str(b.fixtureId, 100);
    const oppositionTeam  = str(b.oppositionTeam, 100);
    const round           = str(b.round, 30);
    const submitterName   = str(b.submitterName, 100);
    const initials        = str(b.signatureDataUrl, 5);

    if (!accessCode)     return err("accessCode is required.");
    if (!competition)    return err("competition is required.");
    if (!matchDate)      return err("matchDate is required.");
    if (!ageGroup)       return err("ageGroup is required.");
    if (!fixtureId)      return err("fixtureId is required.");
    if (!oppositionTeam) return err("oppositionTeam is required.");
    if (!round)          return err("round is required.");
    if (!submitterName)  return err("submitterName is required.");
    if (!initials)       return err("initials are required (max 5 chars).");

    if (!DATE_RE.test(matchDate)) return err("matchDate must be YYYY-MM-DD.");
    if (isNaN(new Date(matchDate).getTime())) return err("matchDate is not a valid date.");
    if (!INITIALS_RE.test(initials)) return err("initials must be letters only (max 5).");

    const [leagueRow] = await db
      .select()
      .from(leagues)
      .where(eq(leagues.name, competition))
      .limit(1);
    if (!leagueRow) return err(`Unknown competition: "${competition}".`);

    const allowedAgeGroups = AGE_GROUPS[competition] ?? [];
    if (!allowedAgeGroups.includes(ageGroup)) {
      return err(`Unknown age group "${ageGroup}" for competition "${competition}".`);
    }

    const gradeKey = `${competition}::${ageGroup}`;
    const allowedGrades = GRADE_MAP[gradeKey] ?? [];
    if (competition === "SFL") {
      if (!grade) return err("grade is required for SFL competitions.");
      if (!allowedGrades.includes(grade)) {
        return err(`Unknown grade "${grade}" for ${competition} ${ageGroup}.`);
      }
    }

    if (!ROUND_OPTIONS.has(round)) return err(`Unknown round: "${round}".`);

    const [codeRow] = await db
      .select({ teamName: teamAccessCodes.teamName, gradeName: teamAccessCodes.gradeName })
      .from(teamAccessCodes)
      .where(
        and(
          eq(teamAccessCodes.code, accessCode.toUpperCase()),
          eq(teamAccessCodes.active, true),
        ),
      )
      .limit(1);

    if (!codeRow) {
      return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
    }

    const effectiveGrade = grade ?? codeRow.gradeName;
    const submittingTeam = codeRow.teamName;

    if (competition === "SFL" && codeRow.gradeName !== effectiveGrade) {
      return NextResponse.json(
        { error: "Access code does not match the selected grade." },
        { status: 401 },
      );
    }

    if (submittingTeam === oppositionTeam) {
      return err("Submitting team and opposition team cannot be the same.");
    }

    // Look up the fixture by id and verify it actually pairs submittingTeam with
    // oppositionTeam (in either home/away orientation). This is the only check
    // that catches a tampered/desynced client trying to submit votes for a
    // fixture they didn't play.
    const [fixtureRow] = await db
      .select({
        id:           fixtures.id,
        gradeName:    fixtures.gradeName,
        roundName:    fixtures.roundName,
        matchDate:    fixtures.matchDate,
        homeTeamName: fixtures.homeTeamName,
        awayTeamName: fixtures.awayTeamName,
      })
      .from(fixtures)
      .where(eq(fixtures.id, fixtureId))
      .limit(1);

    if (!fixtureRow) {
      return err("Fixture not found.");
    }

    if (
      fixtureRow.gradeName !== effectiveGrade ||
      fixtureRow.roundName !== round ||
      fixtureRow.matchDate !== matchDate
    ) {
      return err("Fixture does not match selected grade, round, and match date.");
    }

    const sides = new Set([fixtureRow.homeTeamName, fixtureRow.awayTeamName]);
    if (!sides.has(submittingTeam) || !sides.has(oppositionTeam)) {
      return err("Fixture does not match submitting team and opposition.");
    }

    const { inWindow } = await resolveVoteWindow(
      matchDate,
      competition,
      effectiveGrade ?? "",
      round,
      fixtureRow.id,
    );

    if (!inWindow) {
      return NextResponse.json(
        { error: `Votes can only be submitted within ${VOTE_WINDOW.daysAfterMatch} day(s) of the match, unless the window has been extended by an admin.` },
        { status: 422 },
      );
    }

    const SUBMISSION_LIMIT = 3;
    const [countRow] = await db
      .select({ n: count() })
      .from(bestAndFairest)
      .where(
        and(
          eq(bestAndFairest.competition, competition),
          eq(bestAndFairest.grade, effectiveGrade ?? ""),
          eq(bestAndFairest.round, round),
        ),
      );

    if ((countRow?.n ?? 0) >= SUBMISSION_LIMIT) {
      return NextResponse.json(
        { error: `The maximum ${SUBMISSION_LIMIT} votes for ${round} have already been submitted.` },
        { status: 409 },
      );
    }

    const playerFields = [1, 2, 3, 4, 5].map((n) => {
      const num = str(b[`player${n}Number`], 4);
      const name = str(b[`player${n}Name`], 100);
      if (!num) return { error: `player${n}Number is required.` };
      if (!name) return { error: `player${n}Name is required.` };
      if (!NUMBER_RE.test(num)) return { error: `player${n}Number must be numeric (1-4 digits).` };
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

    const rosterRows = await db
      .select({
        playerNumber: teamPlayers.playerNumber,
        firstName: teamPlayers.firstName,
        lastName: teamPlayers.lastName,
      })
      .from(teamPlayers)
      .where(eq(teamPlayers.teamName, submittingTeam));

    if (rosterRows.length > 0) {
      const rosterNums = new Set(rosterRows.map((r) => r.playerNumber).filter(Boolean) as string[]);
      const outsiders = nums.filter((n) => !rosterNums.has(n));
      if (outsiders.length > 0) {
        return NextResponse.json(
          { error: `Player number${outsiders.length > 1 ? "s" : ""} ${outsiders.join(", ")} are not on ${submittingTeam}'s roster. You may only vote for your own team's players.` },
          { status: 422 },
        );
      }
    }

    if (rosterRows.length > 0) {
      const rosterByNumber = new Map<string, Set<string>>();
      for (const r of rosterRows) {
        if (!r.playerNumber) continue;
        if (!rosterByNumber.has(r.playerNumber)) rosterByNumber.set(r.playerNumber, new Set());
        const fullName = `${r.firstName} ${r.lastName}`.trim();
        if (fullName) rosterByNumber.get(r.playerNumber)?.add(toTitleCase(fullName));
      }
      for (const p of [p1, p2, p3, p4, p5]) {
        const validNames = rosterByNumber.get(p.num);
        if (!validNames || validNames.size === 0) continue;
        if (!validNames.has(toTitleCase(p.name))) {
          return NextResponse.json(
            { error: `Player #${p.num} name does not match the team roster.` },
            { status: 422 },
          );
        }
      }
    }

    const [inserted] = await db
      .insert(bestAndFairest)
      .values({
        competition,
        matchDate,
        ageGroup,
        grade: effectiveGrade ?? null,
        submittingTeam,
        opposition: oppositionTeam,
        round,
        player1Number: p1.num,
        player1Name: toTitleCase(p1.name),
        player2Number: p2.num,
        player2Name: toTitleCase(p2.name),
        player3Number: p3.num,
        player3Name: toTitleCase(p3.name),
        player4Number: p4.num,
        player4Name: toTitleCase(p4.name),
        player5Number: p5.num,
        player5Name: toTitleCase(p5.name),
        submitterName,
        signatureDataUrl: initials,
      })
      .returning();

    logger.info("[best-and-fairest] vote submitted", {
      category: "business",
      grade: effectiveGrade,
      round,
      submittingTeam,
      oppositionTeam,
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
