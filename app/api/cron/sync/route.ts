import { NextRequest, NextResponse } from "next/server";

import { runSync } from "@/lib/sync";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader  = req.headers.get("authorization");
    const querySecret = req.nextUrl.searchParams.get("secret");
    const provided    = authHeader?.replace("Bearer ", "") ?? querySecret ?? "";
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const started = Date.now();
  const log: string[] = [`Sync started at ${new Date().toISOString()}`];

  try {
    await runSync(log);
    log.push(`Sync completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return NextResponse.json({ success: true, log });
  } catch (err) {
    const msg = (err as Error).message;
    log.push(`ERROR: ${msg}`);
    logger.error("[cron/sync] failed", { category: "sync", error: String(err) });
    return NextResponse.json({ success: false, log, error: msg }, { status: 500 });
  }
}
