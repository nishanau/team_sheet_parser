/**
 * useVerifiedSession — shared localStorage session for code-gated forms.
 *
 * Security design:
 *  - The raw access code is NEVER written to localStorage (persistent storage).
 *    It IS kept in sessionStorage (tab-scoped, cleared on close) so submissions
 *    within the same tab can re-send it for server re-validation.
 *  - localStorage stores only { teamName, gradeName, expiresAt } with a 12-hour
 *    TTL. This lets users reload the page without re-entering their code, but
 *    forces re-entry after 12 h (covers a match day; next round needs a new entry).
 *  - Expired localStorage sessions are silently cleared on page load.
 *  - If sessionStorage has no code (new tab / code cleared) but localStorage
 *    still has a valid session, the gate is shown again to re-collect the code.
 *    The team identity fields are pre-filled from localStorage so the user only
 *    needs to re-enter the code, not re-navigate menus.
 *  - The server re-validates the code on every POST, so deactivating a code
 *    immediately blocks future submissions even from sessions with a valid TTL.
 *  - Each form type has its own storage keys (independent BnF and CV sessions).
 */
"use client";

import { useState, useEffect, startTransition } from "react";

/** How long the identity session lasts (12 hours in ms). */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface VerifiedSession {
  teamName:  string;
  gradeName: string;
  /** The raw access code — kept only in sessionStorage (tab lifetime). */
  code:      string;
  /** Epoch ms when this session expires. */
  expiresAt: number;
}

interface StoredIdentity {
  teamName:  string;
  gradeName: string;
  expiresAt: number;
}

function readIdentity(lsKey: string): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredIdentity>;
    if (
      typeof p.teamName  !== "string" ||
      typeof p.gradeName !== "string" ||
      typeof p.expiresAt !== "number"
    ) { localStorage.removeItem(lsKey); return null; }
    if (Date.now() > p.expiresAt) { localStorage.removeItem(lsKey); return null; }
    return { teamName: p.teamName, gradeName: p.gradeName, expiresAt: p.expiresAt };
  } catch {
    localStorage.removeItem(lsKey);
    return null;
  }
}

function readCode(ssKey: string): string | null {
  try { return sessionStorage.getItem(ssKey) || null; } catch { return null; }
}

/**
 * @param lsKey  localStorage key for the identity (e.g. "bf_identity")
 * @param ssKey  sessionStorage key for the code   (e.g. "bf_code")
 */
export function useVerifiedSession(lsKey: string, ssKey: string) {
  const [session,  setSession]  = useState<VerifiedSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    startTransition(() => {
      const identity = readIdentity(lsKey);
      const code     = identity ? readCode(ssKey) : null;
      // Only fully verified if we have both identity (not expired) AND the code
      // in sessionStorage. If identity exists but code is missing (new tab),
      // we still show the gate — but callers can use identity to pre-fill hints.
      setSession(identity && code ? { ...identity, code } : null);
      setHydrated(true);
    });
  }, [lsKey, ssKey]);

  function verify(teamName: string, gradeName: string, code: string) {
    const expiresAt = Date.now() + SESSION_TTL_MS;
    // Identity → localStorage (survives reloads, expires in 12 h)
    const identity: StoredIdentity = { teamName, gradeName, expiresAt };
    localStorage.setItem(lsKey, JSON.stringify(identity));
    // Code → sessionStorage only (cleared when tab closes)
    try { sessionStorage.setItem(ssKey, code); } catch { /* storage blocked */ }
    setSession({ teamName, gradeName, code, expiresAt });
  }

  function logout() {
    localStorage.removeItem(lsKey);
    try { sessionStorage.removeItem(ssKey); } catch { /* ignore */ }
    setSession(null);
  }

  return { session, hydrated, verify, logout };
}
