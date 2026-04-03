type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

function send(level: Level, message: string, context: Context = {}): void {
  // NOTE: logger-controlled fields (level, message, timestamp) intentionally
  // override any same-named keys in context.
  const event = { ...context, level, message, timestamp: new Date().toISOString() };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(event));
  if (
    process.env.NODE_ENV === "production" &&
    process.env.AXIOM_TOKEN &&
    process.env.AXIOM_DATASET
  ) {
    fetch(
      `https://api.axiom.co/v1/datasets/${encodeURIComponent(process.env.AXIOM_DATASET)}/ingest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([event]),
      }
    ).catch((err) => {
      console.warn("logger: axiom ingest failed", err instanceof Error ? err.message : err);
    });
  }
}

export const logger = {
  debug: (msg: string, ctx?: Context) => send("debug", msg, ctx),
  info:  (msg: string, ctx?: Context) => send("info",  msg, ctx),
  warn:  (msg: string, ctx?: Context) => send("warn",  msg, ctx),
  error: (msg: string, ctx?: Context) => send("error", msg, ctx),
};
