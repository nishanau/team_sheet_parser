import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";

import { coachesVotes, fixtures, teamAccessCodes, teamPlayers } from "@/db/schema";
import { ROUND_OPTIONS as ROUND_OPTIONS_ARR, VOTE_WINDOW } from "@/lib/constants";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { toTitleCase } from "@/lib/utils";
import { resolveVoteWindow } from "@/lib/voteWindow";

export const COACHES_VOTE_GRADES = [
  "SFL Community League Senior Men",
  "SFL Community League Senior Women",
] as const;

const COACHES_VOTE_GRADE_SET = new Set<string>(COACHES_VOTE_GRADES);
const ROUND_OPTIONS = new Set(ROUND_OPTIONS_ARR);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE = /^\d{1,4}$/;
const INITIALS_RE = /^[A-Za-z]{1,5}$/;

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

    const accessCode = str(b.accessCode, 9);
    const grade = str(b.grade, 200);
    const round = str(b.round, 30);
    const matchDate = str(b.matchDate, 10);
    const homeTeam = str(b.homeTeam, 100);
    const awayTeam = str(b.awayTeam, 100);
    const coachTeam = str(b.coachTeam, 100);
    const submitterName = str(b.submitterName, 100);
    const initials = str(b.signatureDataUrl, 5);

    if (!accessCode) return err("accessCode is required.");
    if (!grade) return err("grade is required.");
    if (!round) return err("round is required.");
    if (!matchDate) return err("matchDate is required.");
    if (!homeTeam) return err("homeTeam is required.");
    if (!awayTeam) return err("awayTeam is required.");
    if (!coachTeam) return err("coachTeam is required.");
    if (!submitterName) return err("submitterName is required.");
    if (!initials) return err("initials are required (max 5 chars).");

    if (!DATE_RE.test(matchDate)) return err("matchDate must be YYYY-MM-DD.");
    if (isNaN(new Date(matchDate).getTime())) return err("matchDate is not a valid date.");
    if (!INITIALS_RE.test(initials)) return err("initials must be letters only (max 5).");

    if (!COACHES_VOTE_GRADE_SET.has(grade)) {
      return err(`Coaches Vote is only available for: ${COACHES_VOTE_GRADES.join(", ")}.`);
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
    if (codeRow.teamName !== coachTeam || codeRow.gradeName !== grade) {
      return NextResponse.json(
        { error: "Access code does not match the selected team and grade." },
        { status: 401 },
      );
    }

    if (homeTeam === awayTeam) return err("Home team and away team cannot be the same.");

    const [fixtureRow] = await db
      .select({ id: fixtures.id })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.gradeName, grade),
          eq(fixtures.roundName, round),
          eq(fixtures.homeTeamName, homeTeam),
          eq(fixtures.awayTeamName, awayTeam),
        ),
      )
      .limit(1);

    const { inWindow } = await resolveVoteWindow(
      matchDate,
      "SFL",
      grade,
      round,
      fixtureRow?.id ?? null,
    );

    if (!inWindow) {
      return NextResponse.json(
        { error: `Votes can only be submitted within ${VOTE_WINDOW.daysAfterMatch} day(s) of the match, unless the window has been extended by an admin.` },
        { status: 422 },
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

    const existing = await db
      .select({ id: coachesVotes.id })
      .from(coachesVotes)
      .where(
        and(
          eq(coachesVotes.grade, grade),
          eq(coachesVotes.round, round),
          eq(coachesVotes.homeTeam, homeTeam),
          eq(coachesVotes.awayTeam, awayTeam),
          eq(coachesVotes.coachTeam, coachTeam),
        ),
      );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Votes for ${coachTeam} in this game have already been submitted. Only one submission per team per game is allowed.` },
        { status: 409 },
      );
    }

    const rosterRows = await db
      .select({
        playerNumber: teamPlayers.playerNumber,
        firstName: teamPlayers.firstName,
        lastName: teamPlayers.lastName,
      })
      .from(teamPlayers)
      .where(
        or(
          eq(teamPlayers.teamName, homeTeam),
          eq(teamPlayers.teamName, awayTeam),
        ),
      );

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
            { error: `Player #${p.num} name does not match the match roster.` },
            { status: 422 },
          );
        }
      }
    }

    const [inserted] = await db
      .insert(coachesVotes)
      .values({
        grade,
        round,
        matchDate,
        homeTeam,
        awayTeam,
        coachTeam,
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
