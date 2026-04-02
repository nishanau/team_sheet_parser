"use client";
import { useState } from "react";
import styles from "./sync.module.css";

export default function SyncPage() {
  const [log,     setLog]     = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  async function handleSync() {
    setRunning(true);
    setLog(["Starting sync…"]);
    const res  = await fetch("/api/admin/sync", { method: "POST" });
    const data = await res.json() as { log: string[] };
    setLog(data.log);
    setRunning(false);
  }

  return (
    <div>
      <h1 className={styles.title}>PlayHQ Sync</h1>
      <p className={styles.hint}>Fetches fixtures, teams, and clubs from PlayHQ and updates the database.</p>
      <button className={styles.btn} onClick={handleSync} disabled={running}>
        {running ? "Syncing…" : "Run PlayHQ Sync"}
      </button>
      {log.length > 0 && (
        <pre className={styles.log}>{log.join("\n")}</pre>
      )}
    </div>
  );
}
