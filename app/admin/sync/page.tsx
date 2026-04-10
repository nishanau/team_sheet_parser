"use client";
import { useState, useEffect, useRef } from "react";
import styles from "./sync.module.css";

type SyncStatus = "idle" | "running" | "done" | "error";
interface SyncState { status: SyncStatus; log: string[]; startedAt: string | null; finishedAt: string | null; }

export default function SyncPage() {
  const [state,   setState]   = useState<SyncState>({ status: "idle", log: [], startedAt: null, finishedAt: null });
  const [posting, setPosting] = useState(false);
  const logRef                = useRef<HTMLPreElement>(null);
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailures          = useRef(0);

  async function fetchSyncState() {
    try {
      const res  = await fetch("/api/admin/sync");
      const data = await res.json() as SyncState;
      pollFailures.current = 0;
      setState(data);
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      if (data.status !== "running" && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      pollFailures.current += 1;
      if (pollFailures.current >= 5) {
        setState((prev) => ({ ...prev, status: "error", log: [...prev.log, "Connection lost. Please refresh."] }));
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }
  }

  useEffect(() => { fetchSyncState(); }, []);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchSyncState, 1000);
  }

  async function handleSync(type: "fixtures" | "full") {
    setPosting(true);
    pollFailures.current = 0;
    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.status === 409) {
        // Already running — just start polling to show progress
      } else if (!res.ok) {
        const data = await res.json() as { error?: string };
        setState((prev) => ({ ...prev, status: "error", log: [data.error ?? "Failed to start sync."] }));
        return;
      }
      startPolling();
    } finally {
      setPosting(false);
    }
  }

  const running = state.status === "running";

  return (
    <div>
      <h1 className={styles.title}>PlayHQ Sync</h1>
      <p className={styles.hint}>
        <strong>Sync Fixtures</strong> — fast daily sync, updates rounds/dates/venues from existing teams.<br />
        <strong>Full Sync</strong> — re-fetches clubs and teams from PlayHQ, then syncs fixtures.
      </p>
      <div className={styles.btnGroup}>
        <button className={styles.btn} onClick={() => handleSync("fixtures")} disabled={running || posting}>
          {running ? "Syncing…" : "Sync Fixtures"}
        </button>
        <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => handleSync("full")} disabled={running || posting}>
          {running ? "Syncing…" : "Full Sync"}
        </button>
      </div>
      {state.status !== "idle" && (
        <div className={styles.meta}>
          {state.startedAt  && <span>Started: {new Date(state.startedAt).toLocaleTimeString()}</span>}
          {state.finishedAt && <span> · Finished: {new Date(state.finishedAt).toLocaleTimeString()}</span>}
          {state.status === "done"  && <span className={styles.statusDone}> · ✓ Done</span>}
          {state.status === "error" && <span className={styles.statusErr}> · ✗ Error</span>}
          {running                  && <span className={styles.statusRunning}> · Running…</span>}
        </div>
      )}
      {state.log.length > 0 && (
        <pre ref={logRef} className={styles.log}>{state.log.join("\n")}</pre>
      )}
    </div>
  );
}
