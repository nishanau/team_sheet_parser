"use client";

import { useState, useEffect } from "react";
import styles from "./BestAndFairest.module.css";
import matchStyles from "../coachesvote/CoachesVote.module.css";
import PlayerInput from "../../components/PlayerInput";
import type { GamePlayer } from "@/app/api/game-players/route";
import { useVerifiedSession } from "@/lib/useVerifiedSession";
import { toTitleCase } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FixtureRow {
  id:           string;
  gradeName:    string;
  roundName:    string;
  matchDate:    string;
  homeTeamName: string;
  awayTeamName: string;
  venueName:    string | null;
  canVote:      boolean;
  blockReason:  string | null;
}

const VOTE_LABELS = ["5", "4", "3", "2", "1"];

// Derive competition + ageGroup from gradeName stored in the session
function parseGrade(gradeName: string): { competition: string; ageGroup: string } {
  const sflIdx = gradeName.indexOf("SFL ");
  if (sflIdx !== -1 && gradeName.indexOf("STJFL ") === -1) {
    // Maps grade name suffixes (as they appear in PlayHQ) → AGE_GROUPS.SFL values in constants.ts
    const gradeEndingToAgeGroup: Record<string, string> = {
      "Senior Men":    "Senior Men",
      "Reserves Men":  "Reserves Men",
      "U18 Boys":      "U18 Men",   // PlayHQ uses "Boys", AGE_GROUPS uses "Men"
      "Senior Women":  "Senior Women",
    };
    const afterSfl = gradeName.slice(sflIdx + 4);
    const match = Object.entries(gradeEndingToAgeGroup).find(([ending]) => afterSfl.endsWith(ending));
    const ag = match ? match[1] : afterSfl;
    return { competition: "SFL", ageGroup: ag };
  }
  const stjflIdx = gradeName.indexOf("STJFL ");
  if (stjflIdx !== -1) {
    return { competition: "STJFL", ageGroup: gradeName.slice(stjflIdx + 6) };
  }
  return { competition: "SFL", ageGroup: gradeName };
}

// ─── Access Code Gate ──────────────────────────────────────────────────────────
function CodeGate({ onVerified }: { onVerified: (teamName: string, gradeName: string, code: string) => void }) {
  const [code,      setCode]      = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setVerifying(true);
    try {
      const trimmed = code.trim().toUpperCase();
      const res  = await fetch("/api/verify-code", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ accessCode: trimmed, formType: "bnf" }),
      });
      const data = await res.json() as { teamName?: string; gradeName?: string; error?: string };
      if (!res.ok) {
        setCodeError(data.error ?? "Invalid access code.");
        return;
      }
      onVerified(data.teamName!, data.gradeName!, trimmed);
    } catch {
      setCodeError("Could not verify code. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Best &amp; Fairest Votes</h1>
            <p className={styles.sub}>Enter your team access code to continue.</p>
          </div>
        </div>
        <form onSubmit={handleVerify} className={styles.formBody}>
          <section className={styles.section}>
            <div className={styles.fieldGroup} style={{ maxWidth: 280 }}>
              <label className={styles.label} htmlFor="accessCode">Access Code</label>
              <input
                id="accessCode"
                type="text"
                className={styles.input}
                placeholder="e.g. A3BX-7K2M"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={9}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            {codeError && <div className={styles.errorBanner}>{codeError}</div>}
          </section>
          <div className={styles.formFooter}>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={verifying || code.trim().length < 4}
            >
              {verifying ? "Verifying…" : "Unlock Form"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page Shell ───────────────────────────────────────────────────────────
export default function BestAndFairestPage() {
  const { session, hydrated, verify, logout } = useVerifiedSession("bf_identity", "bf_code");

  if (!hydrated) return null;

  if (!session) {
    return <CodeGate onVerified={verify} />;
  }

  return (
    <BestAndFairestForm
      teamName={session.teamName}
      gradeName={session.gradeName}
      accessCode={session.code}
      expiresAt={session.expiresAt}
      onLogout={logout}
    />
  );
}

// ─── Form (shown once verified) ───────────────────────────────────────────────
function BestAndFairestForm({
  teamName,
  gradeName,
  accessCode,
  expiresAt,
  onLogout,
}: {
  teamName:   string;
  gradeName:  string;
  accessCode: string;
  expiresAt:  number;
  onLogout:   () => void;
}) {
  const { competition, ageGroup } = parseGrade(gradeName);

  const [selectedFixture, setSelectedFixture] = useState<FixtureRow | null>(null);

  const [availableFixtures,  setAvailableFixtures]  = useState<FixtureRow[]>([]);
  const [submittedByRound,   setSubmittedByRound]   = useState<Record<string, number>>({});
  const [fixturesLoading,    setFixturesLoading]    = useState(true);
  const [fixturesError,      setFixturesError]      = useState<string | null>(null);

  const [teamPlayers,   setTeamPlayers]   = useState<GamePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  const [players,       setPlayers]       = useState(emptyPlayers);
  const [submitterName, setSubmitterName] = useState("");
  const [initials,      setInitials]      = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // Session expiry countdown (shown when < 60 min remain)
  const [minsLeft, setMinsLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const remaining = Math.floor((expiresAt - Date.now()) / 60000);
      setMinsLeft(remaining <= 60 ? Math.max(0, remaining) : null);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFixtures(); }, [gradeName, teamName]); // loadFixtures is stable per render

  function loadFixtures() {
    setFixturesLoading(true);
    setFixturesError(null);
    fetch(
      `/api/best-and-fairest/fixtures?grade=${encodeURIComponent(gradeName)}&teamName=${encodeURIComponent(teamName)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object" && "fixtures" in data) {
          const res = data as { fixtures: FixtureRow[]; submittedByRound: Record<string, number> };
          setAvailableFixtures(res.fixtures);
          setSubmittedByRound(res.submittedByRound);
        } else {
          setFixturesError((data as { error: string }).error ?? "Failed to load fixtures.");
        }
      })
      .catch(() => setFixturesError("Failed to load fixtures. Please refresh."))
      .finally(() => setFixturesLoading(false));
  }

  useEffect(() => {
    setPlayers(emptyPlayers());
    setTeamPlayers([]);
  }, [selectedFixture]);

  useEffect(() => {
    if (!selectedFixture) return;
    setPlayersLoading(true);
    const { id } = selectedFixture;
    fetch(`/api/game-players?gameId=${encodeURIComponent(id)}&teamName=${encodeURIComponent(teamName)}`)
      .then((r) => r.json())
      .then((data) => setTeamPlayers((data as { players: GamePlayer[] }).players ?? []))
      .catch(() => setTeamPlayers([]))
      .finally(() => setPlayersLoading(false));
  }, [selectedFixture, teamName]);

  function emptyPlayers() {
    return Array.from({ length: 5 }, () => ({ number: "", name: "" }));
  }

  function updatePlayer(idx: number, field: "number" | "name", value: string) {
    setPlayers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  const allGamePlayers: GamePlayer[] = teamPlayers;

  // Build a Set of already-selected jumper numbers, excluding the current row
  function excludeNumbers(currentIdx: number): Set<string> {
    const selected = new Set<string>();
    for (let i = 0; i < players.length; i++) {
      if (i !== currentIdx && players[i].number.trim()) {
        selected.add(players[i].number.trim());
      }
    }
    return selected;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFixture) return;
    setError(null);

    if (!submitterName.trim()) { setError("Please enter your name before submitting."); return; }
    if (!initials.trim())      { setError("Please enter your initials before submitting."); return; }

    const enteredNums = players.map((p) => p.number.trim()).filter(Boolean);
    if (new Set(enteredNums).size !== enteredNums.length) {
      const seen  = new Set<string>();
      const dupes = enteredNums.filter((n) => seen.size === seen.add(n).size);
      setError(`Duplicate player number${dupes.length > 1 ? "s" : ""}: ${[...new Set(dupes)].join(", ")}.`);
      return;
    }

    // Title-case all names before validation and submission
    const normalizedPlayers = players.map((p) => ({
      number: p.number,
      name: toTitleCase(p.name.trim()),
    }));

    // Validate (number, name) pairs against fetched roster — skip if no player data
    if (teamPlayers.length > 0) {
      const rosterSet = new Set(
        teamPlayers
          .filter((p) => p.playerNumber)
          .map((p) => `${p.playerNumber}|${toTitleCase(`${p.firstName} ${p.lastName}`.trim())}`)
      );
      for (const p of normalizedPlayers) {
        if (!p.number.trim() || !p.name) continue;
        if (!rosterSet.has(`${p.number.trim()}|${p.name}`)) {
          setError(`Player #${p.number} "${p.name}" does not match any player in this match.`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/best-and-fairest", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessCode,
          competition,
          matchDate:   selectedFixture.matchDate,
          ageGroup,
          grade:       gradeName,
          homeTeam:    selectedFixture.homeTeamName,
          opposition:  selectedFixture.awayTeamName,
          round:       selectedFixture.roundName,
          player1Number: normalizedPlayers[0].number || null, player1Name: normalizedPlayers[0].name || null,
          player2Number: normalizedPlayers[1].number || null, player2Name: normalizedPlayers[1].name || null,
          player3Number: normalizedPlayers[2].number || null, player3Name: normalizedPlayers[2].name || null,
          player4Number: normalizedPlayers[3].number || null, player4Name: normalizedPlayers[3].name || null,
          player5Number: normalizedPlayers[4].number || null, player5Name: normalizedPlayers[4].name || null,
          submitterName: submitterName.trim(),
          signatureDataUrl: initials.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");
      setSubmitted(true);
      setSubmittedByRound((prev) => ({
        ...prev,
        [selectedFixture.roundName]: (prev[selectedFixture.roundName] ?? 0) + 1,
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedFixture(null);
    setPlayers(emptyPlayers());
    setSubmitterName("");
    setInitials("");
    setSubmitted(false);
    setError(null);
    loadFixtures();
  }

  if (fixturesLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <p className={styles.sub} style={{ padding: "24px" }}>Loading matches…</p>
          </div>
        </div>
      </div>
    );
  }

  if (fixturesError) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.errorBanner} style={{ margin: 24 }}>{fixturesError}</div>
        </div>
      </div>
    );
  }

  if (submitted && selectedFixture) {
    const submitCount = submittedByRound[selectedFixture.roundName] ?? 0;
    const remaining   = Math.max(0, 3 - submitCount);
    return (
      <div className={styles.page}>
        <div className={`${styles.card} ${styles.successCard}`}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>Votes Submitted!</h2>
          <p className={styles.successSub}>
            Best &amp; Fairest votes for <strong>{selectedFixture.homeTeamName}</strong> vs{" "}
            <strong>{selectedFixture.awayTeamName}</strong> on{" "}
            <strong>{selectedFixture.matchDate}</strong> have been recorded.
            {remaining > 0 && (
              <> You have <strong>{remaining}</strong> submission{remaining !== 1 ? "s" : ""} remaining for this round.</>
            )}
          </p>
          {remaining > 0 && availableFixtures.length > 1 ? (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleReset}>
              Submit Another Match
            </button>
          ) : (
            <p className={styles.sub} style={{ marginTop: 16 }}>No more matches to vote on.</p>
          )}
        </div>
      </div>
    );
  }

  const hasPlayerData = teamPlayers.length > 0;
  const gradePretty = gradeName
    .replace("SFL Premier League ", "")
    .replace("SFL Community League ", "")
    .replace("STJFL ", "");

  const header = (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Best &amp; Fairest Votes</h1>
        <p className={styles.sub}>
          {teamName} &mdash; {gradePretty}
          {minsLeft !== null && (
            <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.6 }}>
              (session expires in {minsLeft} min)
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnSecondary}`}
        onClick={onLogout}
        style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
      >
        Change Team
      </button>
    </div>
  );

  // ── Step 1: Pick a match ──────────────────────────────────────────────────
  if (!selectedFixture) {
    if (availableFixtures.length === 0) {
      return (
        <div className={styles.page}>
          <div className={styles.card}>
            {header}
            <div className={styles.formBody}>
              <p className={styles.sub} style={{ padding: "8px 0 24px" }}>
                No matches scheduled yet. Fixtures will appear here once they are available.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.page}>
        <div className={styles.card}>
          {header}
          <div className={styles.formBody}>
            <section className={styles.section}>
              <div className={styles.sectionTitle}>Select a Match</div>
              <p className={styles.sectionHint}>
                Matches you can vote on today or tomorrow are highlighted. Others are shown for reference.
              </p>
              <div className={matchStyles.matchList}>
                {availableFixtures.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`${matchStyles.matchCard}${!f.canVote ? ` ${matchStyles.matchCardDisabled}` : ""}`}
                    onClick={() => f.canVote && setSelectedFixture(f)}
                    disabled={!f.canVote}
                    title={f.blockReason ?? undefined}
                  >
                    <span className={matchStyles.matchRound}>{f.roundName}</span>
                    <span className={matchStyles.matchTeams}>
                      {f.homeTeamName} <span className={matchStyles.vs}>vs</span> {f.awayTeamName}
                    </span>
                    <span className={matchStyles.matchDate}>{f.matchDate}</span>
                    {f.venueName && <span className={matchStyles.matchVenue}>{f.venueName}</span>}
                    {!f.canVote && f.blockReason && (
                      <span className={matchStyles.matchBlock}>{f.blockReason}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Fill votes ────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {header}
        <form onSubmit={handleSubmit} className={styles.formBody}>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>Match</div>
            <div className={matchStyles.selectedMatch}>
              <div className={matchStyles.selectedMatchMain}>
                <span className={matchStyles.matchRound}>{selectedFixture.roundName}</span>
                <span className={matchStyles.matchTeams}>
                  {selectedFixture.homeTeamName}{" "}
                  <span className={matchStyles.vs}>vs</span>{" "}
                  {selectedFixture.awayTeamName}
                </span>
                <span className={matchStyles.matchDate}>{selectedFixture.matchDate}</span>
              </div>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setSelectedFixture(null)}
                style={{ fontSize: 13 }}
              >
                Change
              </button>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>Player Votes</div>
            <p className={styles.sectionHint}>
              {playersLoading
                ? "Loading team players…"
                : hasPlayerData
                ? "Select your top 5 players from your team."
                : "Enter the player number and name for each vote position."}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th} style={{ width: 56 }}>Votes</th>
                    <th className={styles.th}>Player</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={i} className={styles.tr}>
                      <td className={styles.td}>
                        <span className={styles.voteBadge}>{VOTE_LABELS[i]}</span>
                      </td>
                      <td className={styles.td}>
                        <PlayerInput
                          numberValue={p.number}
                          nameValue={p.name}
                          players={allGamePlayers}
                          excludeNumbers={excludeNumbers(i)}
                          onNumberChange={(v) => updatePlayer(i, "number", v)}
                          onNameChange={(v) => updatePlayer(i, "name", v)}
                          onSelect={(num, name) => {
                            updatePlayer(i, "number", num);
                            updatePlayer(i, "name", name);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>Sign Off</div>
            <div className={styles.fieldGroup} style={{ maxWidth: 360, marginBottom: 20 }}>
              <label className={styles.label} htmlFor="submitterName">Your Name</label>
              <input
                id="submitterName"
                type="text"
                className={styles.input}
                placeholder="Full name"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                required
              />
            </div>
            <div className={styles.fieldGroup} style={{ maxWidth: 200 }}>
              <label className={styles.label} htmlFor="initials">Initials</label>
              <input
                id="initials"
                type="text"
                className={`${styles.input} ${styles.initialsInput}`}
                placeholder="JD"
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                maxLength={5}
                required
              />
            </div>
          </section>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <div className={styles.formFooter}>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit Votes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
