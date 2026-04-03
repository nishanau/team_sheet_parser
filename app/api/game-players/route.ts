import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamPlayers, gamePlayersFetched } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const PLAYHQ_API = "https://api.playhq.com/graphql";
const PLAYHQ_HEADERS = {
  "Content-Type": "application/json",
  Accept: "*/*",
  Origin: "https://www.playhq.com",
  Tenant: "afl",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
};

const GAME_VIEW_QUERY = [
  "query gameView($gameId: ID!) {",
  "  discoverGame(gameID: $gameId) {",
  "    id",
  "    home { ... on DiscoverTeam { id name } ... on ProvisionalTeam { name } }",
  "    away { ... on DiscoverTeam { id name } ... on ProvisionalTeam { name } }",
  "    statistics {",
  "      home { players { playerNumber player {",
  "        ... on DiscoverParticipant { id profile { id firstName lastName } }",
  "        ... on DiscoverParticipantFillInPlayer { id profile { id firstName lastName } }",
  "        ... on DiscoverGamePermitFillInPlayer { id profile { id firstName lastName } }",
  "        ... on DiscoverRegularFillInPlayer { id name }",
  "        ... on DiscoverAnonymousParticipant { id name }",
  "      } } }",
  "      away { players { playerNumber player {",
  "        ... on DiscoverParticipant { id profile { id firstName lastName } }",
  "        ... on DiscoverParticipantFillInPlayer { id profile { id firstName lastName } }",
  "        ... on DiscoverGamePermitFillInPlayer { id profile { id firstName lastName } }",
  "        ... on DiscoverRegularFillInPlayer { id name }",
  "        ... on DiscoverAnonymousParticipant { id name }",
  "      } } }",
  "    }",
  "  }",
  "}",
].join("\n");

export type GamePlayer = {
  playerNumber: string | null;
  firstName: string;
  lastName: string;
  profileId: string | null;
};

function extractName(player: Record<string, unknown>): {
  firstName: string;
  lastName: string;
  profileId: string | null;
} {
  if (player.profile && typeof player.profile === "object") {
    const p = player.profile as Record<string, unknown>;
    return {
      firstName: (p.firstName as string) ?? "",
      lastName:  (p.lastName  as string) ?? "",
      profileId: (p.id        as string) ?? null,
    };
  }
  const full  = ((player.name as string) ?? "").trim();
  const parts = full.split(" ");
  return {
    firstName: parts[0] ?? full,
    lastName:  parts.slice(1).join(" "),
    profileId: null,
  };
}

/**
 * GET /api/game-players?gameId=abc&teamName=Glenorchy+Senior+Men
 *
 * 1. Has (gameId, teamName) already been fetched?
 *    YES -> return all team_players rows for teamName (full accumulated roster)
 *    NO  -> fetch PlayHQ, upsert new/updated players into team_players,
 *           record in game_players_fetched, return players from this game
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const gameId   = searchParams.get("gameId")?.trim();
  const teamName = searchParams.get("teamName")?.trim();

  if (!gameId || !teamName) {
    return NextResponse.json({ error: "gameId and teamName are required" }, { status: 400 });
  }

  // 1. Already processed this game+team?
  const alreadyFetched = await db
    .select()
    .from(gamePlayersFetched)
    .where(and(eq(gamePlayersFetched.gameId, gameId), eq(gamePlayersFetched.teamName, teamName)));

  if (alreadyFetched.length > 0) {
    const rows = await db.select().from(teamPlayers).where(eq(teamPlayers.teamName, teamName));
    const players: GamePlayer[] = rows.map((r: typeof teamPlayers.$inferSelect) => ({
      playerNumber: r.playerNumber,
      firstName:    r.firstName,
      lastName:     r.lastName,
      profileId:    r.profileId,
    }));
    return NextResponse.json({ players, source: "cache" });
  }

  // 2. Fetch from PlayHQ
  let data: Record<string, unknown>;
  try {
    const res = await fetch(PLAYHQ_API, {
      method:  "POST",
      headers: PLAYHQ_HEADERS,
      body:    JSON.stringify({ query: GAME_VIEW_QUERY, variables: { gameId } }),
      next:    { revalidate: 0 },
    });
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    logger.error("[game-players] PlayHQ fetch error", { error: String(err) });
    const rows = await db.select().from(teamPlayers).where(eq(teamPlayers.teamName, teamName));
    const players: GamePlayer[] = rows.map((r: typeof teamPlayers.$inferSelect) => ({
      playerNumber: r.playerNumber,
      firstName:    r.firstName,
      lastName:     r.lastName,
      profileId:    r.profileId,
    }));
    return NextResponse.json({ players, source: "fallback", error: "PlayHQ unreachable" });
  }

  const game = (data as { data?: { discoverGame?: Record<string, unknown> } })?.data?.discoverGame;
  if (!game) return NextResponse.json({ players: [], source: "none" });

  const homeName = ((game.home as Record<string, unknown>)?.name as string | undefined) ?? "";
  const awayName = ((game.away as Record<string, unknown>)?.name as string | undefined) ?? "";
  const stats    = game.statistics as Record<string, { players: Record<string, unknown>[] }>;
  const tn       = teamName.toLowerCase();

  let rawPlayers: Record<string, unknown>[] = [];
  if (homeName.toLowerCase() === tn) {
    rawPlayers = stats?.home?.players ?? [];
  } else if (awayName.toLowerCase() === tn) {
    rawPlayers = stats?.away?.players ?? [];
  } else {
    const hn = homeName.toLowerCase();
    const an = awayName.toLowerCase();
    if (hn.includes(tn) || tn.includes(hn))      rawPlayers = stats?.home?.players ?? [];
    else if (an.includes(tn) || tn.includes(an)) rawPlayers = stats?.away?.players ?? [];
  }

  if (rawPlayers.length === 0) {
    return NextResponse.json({ players: [], source: "none" });
  }

  const parsed: GamePlayer[] = rawPlayers.map((entry) => {
    const { firstName, lastName, profileId } = extractName(
      (entry.player ?? {}) as Record<string, unknown>
    );
    return {
      playerNumber: (entry.playerNumber as string) ?? null,
      firstName,
      lastName,
      profileId,
    };
  });

  // 3. Upsert into team_players + record the fetch (fire-and-forget)
  // One SELECT to load all existing players for the team, then bulk insert/update
  // instead of N+1 round-trips to Turso.
  (async () => {
    try {
      const existing = await db.select().from(teamPlayers).where(eq(teamPlayers.teamName, teamName));

      const byProfileId = new Map(existing.filter((e) => e.profileId).map((e) => [e.profileId!, e]));
      const byName = new Map(existing.filter((e) => !e.profileId).map((e) => [`${e.firstName}|${e.lastName}`, e]));

      const toInsert: (typeof teamPlayers.$inferInsert)[] = [];
      const toUpdateById: { id: number; set: Partial<typeof teamPlayers.$inferInsert> }[] = [];

      for (const p of parsed) {
        if (p.profileId) {
          const match = byProfileId.get(p.profileId);
          if (match) {
            toUpdateById.push({ id: match.id, set: { playerNumber: p.playerNumber, firstName: p.firstName, lastName: p.lastName, lastSeenGameId: gameId } });
          } else {
            toInsert.push({ teamName, ...p, lastSeenGameId: gameId });
          }
        } else {
          const match = byName.get(`${p.firstName}|${p.lastName}`);
          if (match) {
            toUpdateById.push({ id: match.id, set: { playerNumber: p.playerNumber, lastSeenGameId: gameId } });
          } else {
            toInsert.push({ teamName, ...p, lastSeenGameId: gameId });
          }
        }
      }

      if (toInsert.length > 0) {
        await db.insert(teamPlayers).values(toInsert);
      }
      for (const u of toUpdateById) {
        await db.update(teamPlayers).set(u.set).where(eq(teamPlayers.id, u.id));
      }

      await db.insert(gamePlayersFetched).values({
        gameId,
        teamName,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error("[game-players] upsert error", { error: String(err) });
    }
  })();

  return NextResponse.json({ players: parsed, source: "playhq" });
}
