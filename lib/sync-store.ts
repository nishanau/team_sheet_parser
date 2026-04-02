/**
 * Module-level singleton that holds the current sync state.
 * Lives as long as the Node.js process — survives tab switches and
 * multiple HTTP requests on the same server instance.
 *
 * Shape mirrors what the sync page polls for.
 */

export type SyncStatus = "idle" | "running" | "done" | "error";

export interface SyncState {
  status:    SyncStatus;
  log:       string[];
  startedAt: string | null;
  finishedAt: string | null;
}

// Single shared instance — module singletons are safe in Next.js Node runtime.
const store: SyncState = {
  status:     "idle",
  log:        [],
  startedAt:  null,
  finishedAt: null,
};

export function getSyncState(): Readonly<SyncState> {
  return store;
}

export function startSync(): void {
  store.status     = "running";
  store.log        = [`Sync started at ${new Date().toISOString()}`];
  store.startedAt  = new Date().toISOString();
  store.finishedAt = null;
}

export function appendLog(line: string): void {
  store.log.push(line);
}

export function finishSync(success: boolean): void {
  store.status     = success ? "done" : "error";
  store.finishedAt = new Date().toISOString();
}

export function isRunning(): boolean {
  return store.status === "running";
}
