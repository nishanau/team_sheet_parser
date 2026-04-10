import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runFixtureSync, runFullSync } from "@/lib/sync";
import {
  getSyncState,
  startSync,
  appendLog,
  finishSync,
  isRunning,
} from "@/lib/sync-store";
import { logger } from "@/lib/logger";

// GET — return current sync state (polled by the UI every second)
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(getSyncState());
}

// POST — fire sync in the background and return immediately
// Body: { type: "fixtures" | "full" }  (defaults to "fixtures")
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isRunning()) {
    return NextResponse.json({ error: "Sync already in progress." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as { type?: string };
  const isFull = body.type === "full";

  // Mark as running before going async so a second POST sees the lock immediately
  startSync();
  logger.info("[admin/sync] triggered", {
    category: "business",
    type: isFull ? "full" : "fixtures",
    triggeredBy: session.user.name ?? "unknown",
  });

  const log: string[] = new Proxy([] as string[], {
    get(target, prop) {
      if (prop === "push") {
        return (...args: string[]) => {
          const result = target.push(...args);
          for (const line of args) appendLog(line);
          return result;
        };
      }
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  });

  const started = Date.now();

  (async () => {
    try {
      if (isFull) {
        await runFullSync(log);
      } else {
        await runFixtureSync(log);
      }
      appendLog(`Completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      finishSync(true);
    } catch (err) {
      appendLog(`ERROR: ${(err as Error).message}`);
      logger.error("[admin/sync] failed", { category: "sync", error: String(err) });
      finishSync(false);
    }
  })();

  return NextResponse.json({ started: true });
}
