import { and, desc, eq, isNull } from "drizzle-orm";

import { voteWindowOverrides } from "@/db/schema";
import { VOTE_WINDOW } from "@/lib/constants";
import { db } from "@/lib/db";

function getTasDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Hobart",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type VoteWindowResult = {
  inWindow: boolean;
  extendedUntil: string | null;
};

export async function resolveVoteWindow(
  matchDate: string,
  competition: string,
  grade: string,
  round: string,
  fixtureId: string | null,
): Promise<VoteWindowResult> {
  if (!VOTE_WINDOW.enforce) return { inWindow: true, extendedUntil: null };

  const today = getTasDate(0);

  if (matchDate > today) {
    return { inWindow: false, extendedUntil: null };
  }

  if (fixtureId) {
    const [matchOverride] = await db
      .select({ extendedUntil: voteWindowOverrides.extendedUntil })
      .from(voteWindowOverrides)
      .where(eq(voteWindowOverrides.fixtureId, fixtureId))
      .orderBy(desc(voteWindowOverrides.id))
      .limit(1);

    if (matchOverride) {
      return {
        inWindow: today <= matchOverride.extendedUntil,
        extendedUntil: matchOverride.extendedUntil,
      };
    }
  }

  const [roundOverride] = await db
    .select({ extendedUntil: voteWindowOverrides.extendedUntil })
    .from(voteWindowOverrides)
    .where(
      and(
        eq(voteWindowOverrides.competition, competition),
        eq(voteWindowOverrides.grade, grade),
        eq(voteWindowOverrides.round, round),
        isNull(voteWindowOverrides.fixtureId),
      ),
    )
    .orderBy(desc(voteWindowOverrides.id))
    .limit(1);

  if (roundOverride) {
    return {
      inWindow: today <= roundOverride.extendedUntil,
      extendedUntil: roundOverride.extendedUntil,
    };
  }

  const earliest = getTasDate(-VOTE_WINDOW.daysAfterMatch);
  return {
    inWindow: matchDate >= earliest,
    extendedUntil: null,
  };
}
