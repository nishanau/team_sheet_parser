import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bestAndFairest, leagues, teams } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";

const DAILY_LIMIT = 3;

// ─── Validation constants ─────────────────────────────────────────────────────
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE   = /^\d{1,4}$/;
const INITIALS_RE = /^[A-Za-z]{1,5}$/;

const ROUND_OPTIONS = new Set([
  ...Array.from({ length: 22 }, (_, i) => `Round ${i + 1}`),
  "Finals Week 1", "Finals Week 2", "Finals Week 3", "Grand Final",
]);

// Age groups mirror the constants in /api/leagues
const AGE_GROUPS: Record<string, string[]> = {
  SFL:   ["Senior Men", "Reserves Men", "U18 Men", "Senior Women"],
  STJFL: ["U13", "U14", "U15", "U16"],
};

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
    const competition   = str(b.competition,   50);
    const matchDate     = str(b.matchDate,      10);
    const ageGroup      = str(b.ageGroup,       50);
    const opposition    = str(b.opposition,    100);
    const round         = str(b.round,          30);
    const submitterName = str(b.submitterName, 100);
    const initials      = str(b.signatureDataUrl, 5);  // stored in signatureDataUrl column

    if (!competition)   return err("competition is required (max 50 chars).");
    if (!matchDate)     return err("matchDate is required (max 10 chars).");
    if (!ageGroup)      return err("ageGroup is required (max 50 chars).");
    if (!opposition)    return err("opposition is required (max 100 chars).");
    if (!round)         return err("round is required (max 30 chars).");
    if (!submitterName) return err("submitterName is required (max 100 chars).");
    if (!initials)      return err("initials are required (max 5 chars).");

    // ── Format checks ─────────────────────────────────────────────────────────
    if (!DATE_RE.test(matchDate)) {
      return err("matchDate must be in YYYY-MM-DD format.");
    }
    const parsed = new Date(matchDate);
    if (isNaN(parsed.getTime())) {
      return err("matchDate is not a valid date.");
    }

    if (!INITIALS_RE.test(initials)) {
      return err("initials must be letters only (max 5).");
    }

    // ── Whitelist checks (against DB / known constants) ───────────────────────
    const allLeagues = await db.select().from(leagues);
    const knownLeagueNames = new Set(allLeagues.map((l) => l.name));
    if (!knownLeagueNames.has(competition)) {
      return err(`Unknown competition: "${competition}".`);
    }

    const allowedAgeGroups = AGE_GROUPS[competition] ?? [];
    if (!allowedAgeGroups.includes(ageGroup)) {
      return err(`Unknown age group "${ageGroup}" for competition "${competition}".`);
    }

    if (!ROUND_OPTIONS.has(round)) {
      return err(`Unknown round: "${round}".`);
    }

    const leagueRow = allLeagues.find((l) => l.name === competition)!;
    const allTeams  = await db.select().from(teams).where(eq(teams.leagueId, leagueRow.id));
    const knownTeamNames = new Set(allTeams.map((t) => t.name));
    if (!knownTeamNames.has(opposition)) {
      return err(`Unknown opposition team: "${opposition}".`);
    }

    // ── Player rows ───────────────────────────────────────────────────────────
    const playerFields = [1, 2, 3, 4, 5].map((n) => {
      const num  = str(b[`player${n}Number`], 4);
      const name = str(b[`player${n}Name`],  100);

      if (!num)  return { error: `player${n}Number is required (max 4 chars).` };
      if (!name) return { error: `player${n}Name is required (max 100 chars).` };
      if (!NUMBER_RE.test(num)) {
        return { error: `player${n}Number must be numeric (1–4 digits).` };
      }
      return { num, name };
    });

    for (const p of playerFields) {
      if ("error" in p) return err(p.error!);
    }

    const [p1, p2, p3, p4, p5] = playerFields as { num: string; name: string }[];

    // Duplicate player number check
    const nums = [p1, p2, p3, p4, p5].map((p) => p.num);
    if (new Set(nums).size !== nums.length) {
      return err("Duplicate player numbers are not allowed. Each player must have a unique number.");
    }

    // ── Daily limit ───────────────────────────────────────────────────────────
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bestAndFairest)
      .where(
        and(
          eq(bestAndFairest.competition, competition),
          eq(bestAndFairest.ageGroup, ageGroup),
          eq(bestAndFairest.matchDate, matchDate),
        )
      );

    if (count >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: `Votes for ${ageGroup} (${competition}) on ${matchDate} have already been submitted ${DAILY_LIMIT} times. No more submissions allowed for today.` },
        { status: 429 }
      );
    }

    // ── Insert ────────────────────────────────────────────────────────────────
    const [inserted] = await db
      .insert(bestAndFairest)
      .values({
        competition, matchDate, ageGroup, opposition, round,
        player1Number: p1.num,  player1Name: p1.name,
        player2Number: p2.num,  player2Name: p2.name,
        player3Number: p3.num,  player3Name: p3.name,
        player4Number: p4.num,  player4Name: p4.name,
        player5Number: p5.num,  player5Name: p5.name,
        submitterName,
        signatureDataUrl: initials,
      })
      .returning();

    return NextResponse.json({ success: true, id: inserted.id }, { status: 201 });
  } catch (err) {
    console.error("[best-and-fairest POST]", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
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
    console.error("[best-and-fairest GET]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
