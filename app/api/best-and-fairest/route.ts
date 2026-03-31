import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bestAndFairest } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";

const DAILY_LIMIT = 3;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      competition, matchDate, ageGroup, opposition,
      player1Number, player1Name,
      player2Number, player2Name,
      player3Number, player3Name,
      player4Number, player4Name,
      player5Number, player5Name,
      submitterName, signatureDataUrl,
    } = body;

    if (!competition || !matchDate || !ageGroup || !opposition || !submitterName) {
      return NextResponse.json(
        { error: "competition, matchDate, ageGroup, opposition and submitterName are required." },
        { status: 400 }
      );
    }

    // Daily limit: max 3 submissions per competition + ageGroup per matchDate
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

    const [inserted] = await db
      .insert(bestAndFairest)
      .values({
        competition, matchDate, ageGroup, opposition,
        player1Number, player1Name,
        player2Number, player2Name,
        player3Number, player3Name,
        player4Number, player4Name,
        player5Number, player5Name,
        submitterName,
        signatureDataUrl: signatureDataUrl ?? null,
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
