import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runSync } from "@/lib/sync";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const started = Date.now();
  const log: string[] = [`Admin sync started at ${new Date().toISOString()}`];

  try {
    await runSync(log);
    log.push(`Completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return NextResponse.json({ success: true, log });
  } catch (err) {
    log.push(`ERROR: ${(err as Error).message}`);
    return NextResponse.json({ success: false, log }, { status: 500 });
  }
}
