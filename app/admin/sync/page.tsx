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

  // Poll /api/admin/sync every second while running
  useEffect(() => {
    async function poll() {
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

    // Fetch current state on mount (so refreshing the page shows last run)
    poll();
  }, []);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
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
    }, 1000);
  }

  async function handleSync() {
    setPosting(true);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
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
      <p className={styles.hint}>Fetches fixtures, teams, and clubs from PlayHQ and updates the database.</p>
      <button className={styles.btn} onClick={handleSync} disabled={running || posting}>
        {running ? "Syncing…" : "Run PlayHQ Sync"}
      </button>
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

