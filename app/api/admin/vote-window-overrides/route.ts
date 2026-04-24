import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { auth } from "@/auth";
import { fixtures, teams, voteWindowOverrides } from "@/db/schema";
import { COMPETITIONS, ROUND_OPTIONS } from "@/lib/constants";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROUND_SET = new Set(ROUND_OPTIONS);
const COMP_SET = new Set(COMPETITIONS);

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function competitionForGrade(grade: string): string {
  return grade.includes("STJFL") ? "STJFL" : "SFL";
}

export async function GET() {
  const session = await auth();
  if (!session) return err("Unauthorized", 401);

  const { role, scopedGrades } = session.user;
  if (role !== "superadmin" && role !== "club_admin") return err("Forbidden", 403);

  try {
    const rows = await db
      .select({
        id: voteWindowOverrides.id,
        competition: voteWindowOverrides.competition,
        grade: voteWindowOverrides.grade,
        round: voteWindowOverrides.round,
        fixtureId: voteWindowOverrides.fixtureId,
        homeTeamName: fixtures.homeTeamName,
        awayTeamName: fixtures.awayTeamName,
        extendedUntil: voteWindowOverrides.extendedUntil,
        createdBy: voteWindowOverrides.createdBy,
        createdAt: voteWindowOverrides.createdAt,
      })
      .from(voteWindowOverrides)
      .leftJoin(fixtures, eq(voteWindowOverrides.fixtureId, fixtures.id))
      .orderBy(voteWindowOverrides.createdAt);

    const allowedGrades = new Set(scopedGrades ?? []);
    const filtered = role === "club_admin"
      ? rows.filter((row) => allowedGrades.has(row.grade))
      : rows;

    return NextResponse.json(
      filtered.map((row) => ({
        ...row,
        fixtureLabel: row.homeTeamName && row.awayTeamName
          ? `${row.homeTeamName} vs ${row.awayTeamName}`
          : null,
      })),
    );
  } catch (e) {
    logger.error("[vote-window-overrides] GET failed", { category: "api", error: String(e) });
    return err("Internal server error.", 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return err("Unauthorized", 401);

  const { role, scopedGrades, clubId } = session.user;
  if (role !== "superadmin" && role !== "club_admin") return err("Forbidden", 403);

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId)) return err("Invalid session.", 500);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body.");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return err("Body must be a JSON object.");
  }

  const b = body as Record<string, unknown>;
  const competition = cleanString(b.competition);
  const grade = cleanString(b.grade);
  const round = cleanString(b.round);
  const fixtureId = cleanString(b.fixtureId);
  const extendedUntil = cleanString(b.extendedUntil);

  if (!competition) return err("competition is required.");
  if (!grade) return err("grade is required.");
  if (!round) return err("round is required.");
  if (!extendedUntil) return err("extendedUntil is required.");

  if (!COMP_SET.has(competition)) return err(`Unknown competition: "${competition}".`);
  if (!ROUND_SET.has(round)) return err(`Unknown round: "${round}".`);
  if (!DATE_RE.test(extendedUntil) || isNaN(new Date(extendedUntil).getTime())) {
    return err("extendedUntil must be a valid YYYY-MM-DD date.");
  }

  if (competitionForGrade(grade) !== competition) {
    return err("competition does not match the selected grade.");
  }

  if (role === "club_admin") {
    const allowedGrades = new Set(scopedGrades ?? []);
    if (!allowedGrades.has(grade)) {
      return err("You may only create overrides for your scoped grades.", 403);
    }
    if (!fixtureId) {
      return err("club_admin may only create match-level overrides.", 403);
    }
    if (!clubId) {
      return err("Your account has no associated club.", 403);
    }
  }

  let fixtureRow:
    | { id: string; gradeName: string; roundName: string; homeTeamName: string; awayTeamName: string }
    | undefined;

  if (fixtureId) {
    [fixtureRow] = await db
      .select({
        id: fixtures.id,
        gradeName: fixtures.gradeName,
        roundName: fixtures.roundName,
        homeTeamName: fixtures.homeTeamName,
        awayTeamName: fixtures.awayTeamName,
      })
      .from(fixtures)
      .where(eq(fixtures.id, fixtureId))
      .limit(1);

    if (!fixtureRow) return err(`Fixture "${fixtureId}" not found.`, 404);
    if (fixtureRow.gradeName !== grade) return err("Fixture does not belong to the selected grade.");
    if (fixtureRow.roundName !== round) return err("Fixture does not belong to the selected round.");
    if (competitionForGrade(fixtureRow.gradeName) !== competition) {
      return err("Fixture does not belong to the selected competition.");
    }
  }

  if (role === "club_admin") {
    const clubTeams = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.clubId, clubId as number));

    const clubTeamNames = new Set(clubTeams.map((t) => t.name));
    if (clubTeamNames.size === 0) return err("No teams found for your club.", 403);

    if (
      !fixtureRow ||
      (!clubTeamNames.has(fixtureRow.homeTeamName) && !clubTeamNames.has(fixtureRow.awayTeamName))
    ) {
      return err("You may only create overrides for fixtures involving your club's teams.", 403);
    }
  }

  const existing = await db
    .select({ id: voteWindowOverrides.id })
    .from(voteWindowOverrides)
    .where(
      fixtureId
        ? eq(voteWindowOverrides.fixtureId, fixtureId)
        : and(
            eq(voteWindowOverrides.competition, competition),
            eq(voteWindowOverrides.grade, grade),
            eq(voteWindowOverrides.round, round),
            isNull(voteWindowOverrides.fixtureId),
          ),
    )
    .limit(1);

  try {
    if (existing.length > 0) {
      await db
        .update(voteWindowOverrides)
        .set({
          competition,
          grade,
          round,
          fixtureId: fixtureId ?? null,
          extendedUntil,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        })
        .where(eq(voteWindowOverrides.id, existing[0].id));

      logger.info("[vote-window-overrides] updated", {
        category: "business",
        grade,
        round,
        fixtureId,
        extendedUntil,
        role,
      });
      return NextResponse.json({ success: true, id: existing[0].id });
    }

    const [inserted] = await db
      .insert(voteWindowOverrides)
      .values({
        competition,
        grade,
        round,
        fixtureId: fixtureId ?? null,
        extendedUntil,
        createdBy: userId,
      })
      .returning();

    logger.info("[vote-window-overrides] created", {
      category: "business",
      grade,
      round,
      fixtureId,
      extendedUntil,
      role,
    });
    return NextResponse.json({ success: true, id: inserted.id }, { status: 201 });
  } catch (e) {
    logger.error("[vote-window-overrides] POST failed", { category: "api", error: String(e) });
    return err("Internal server error.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return err("Unauthorized", 401);

  const { role } = session.user;
  if (role !== "superadmin" && role !== "club_admin") return err("Forbidden", 403);

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId)) return err("Invalid session.", 500);

  const idParam = req.nextUrl.searchParams.get("id");
  const id = idParam ? parseInt(idParam, 10) : NaN;
  if (isNaN(id)) return err("id query param is required and must be a number.");

  try {
    const [row] = await db
      .select({ id: voteWindowOverrides.id, createdBy: voteWindowOverrides.createdBy })
      .from(voteWindowOverrides)
      .where(eq(voteWindowOverrides.id, id))
      .limit(1);

    if (!row) return err("Override not found.", 404);

    if (role === "club_admin" && row.createdBy !== userId) {
      return err("You may only delete overrides you created.", 403);
    }

    await db.delete(voteWindowOverrides).where(eq(voteWindowOverrides.id, id));

    logger.info("[vote-window-overrides] deleted", { category: "business", id, role });
    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("[vote-window-overrides] DELETE failed", { category: "api", error: String(e) });
    return err("Internal server error.", 500);
  }
}
