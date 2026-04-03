import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runSync } from "@/lib/sync";
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
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isRunning()) {
    return NextResponse.json({ error: "Sync already in progress." }, { status: 409 });
  }

  // Mark as running before going async so a second POST sees the lock immediately
  startSync();
  logger.info("[admin/sync] triggered", { category: "business", triggeredBy: session.user.name ?? "unknown" });

  // Build a proxy array that forwards every push() to the store
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

  // Fire-and-forget — does NOT block the HTTP response
  (async () => {
    try {
      await runSync(log);
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
