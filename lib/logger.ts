type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

function send(level: Level, message: string, context: Context = {}): void {
  const event = { level, message, timestamp: new Date().toISOString(), ...context };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(event));
  if (
    process.env.NODE_ENV === "production" &&
    process.env.AXIOM_TOKEN &&
    process.env.AXIOM_DATASET
  ) {
    fetch(
      `https://api.axiom.co/v1/datasets/${process.env.AXIOM_DATASET}/ingest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([event]),
      }
    ).catch(() => {});
  }
}

export const logger = {
  debug: (msg: string, ctx?: Context) => send("debug", msg, ctx),
  info:  (msg: string, ctx?: Context) => send("info",  msg, ctx),
  warn:  (msg: string, ctx?: Context) => send("warn",  msg, ctx),
  error: (msg: string, ctx?: Context) => send("error", msg, ctx),
};
