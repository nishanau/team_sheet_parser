import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leagues, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AGE_GROUPS, GRADE_MAP, STJFL_TEAMS } from "@/lib/constants";

export async function GET() {
  try {
    const allLeagues = await db.select().from(leagues).orderBy(leagues.name);
    const allTeams   = await db.select().from(teams).orderBy(teams.name);

    const result = allLeagues.map((league) => {
      const leagueTeams = allTeams.filter((t) => t.leagueId === league.id);
      const ageGroupNames = AGE_GROUPS[league.name] ?? [];

      const ageGroups = ageGroupNames.map((ag) => {
        const key    = `${league.name}::${ag}`;
        const grades = (GRADE_MAP[key] ?? []).map((gradeName) => {
          // For SFL: teams come from DB filtered by gradeName
          // For STJFL: grade list is empty so this map never runs
          const gradeTeams = leagueTeams
            .filter((t) => t.gradeName === gradeName)
            .map((t) => t.name);
          return { name: gradeName, teams: gradeTeams };
        });

        // For STJFL age groups (no grades), still expose the hardcoded team list
        const flatTeams =
          league.name === "STJFL" ? STJFL_TEAMS : [];

        return { name: ag, grades, teams: flatTeams };
      });

      return { name: league.name, ageGroups };
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("[leagues GET]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
