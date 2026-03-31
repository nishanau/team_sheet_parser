import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leagues, teams } from "@/db/schema";
import { eq } from "drizzle-orm";

// Age groups are fixed per competition — not stored in DB since they're
// a league-level configuration rather than per-team.
const AGE_GROUPS: Record<string, string[]> = {
  SFL:   ["Senior Men", "Reserves Men", "U18 Men", "Senior Women"],
  STJFL: ["U13", "U14", "U15", "U16"],
};

export async function GET() {
  try {
    const allLeagues = await db.select().from(leagues).orderBy(leagues.name);
    const allTeams   = await db.select().from(teams).orderBy(teams.name);

    const result = allLeagues.map((league) => ({
      id:        league.id,
      name:      league.name,
      ageGroups: AGE_GROUPS[league.name] ?? [],
      teams:     allTeams
        .filter((t) => t.leagueId === league.id)
        .map((t) => t.name),
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[leagues GET]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
