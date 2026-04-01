"use client";

import { useState, useEffect, startTransition } from "react";
import styles from "../bestandfairest/BestAndFairest.module.css";
import matchStyles from "./CoachesVote.module.css";
import PlayerInput from "../components/PlayerInput";
import type { GamePlayer } from "@/app/api/game-players/route";

// ─── Constants ─────────────────────────────────────────────────────────────────
type CoachesVoteGrade = "SFL Community League Senior Men" | "SFL Community League Senior Women";

// localStorage key for persisted verification
const LS_KEY = "cv_verified";

interface VerifiedState {
  teamName:  string;
  gradeName: string;
  code:      string;
}

interface FixtureRow {
  id:           string;
  gradeName:    string;
  roundName:    string;
  matchDate:    string;
  homeTeamName: string;
  awayTeamName: string;
  venueName:    string | null;
}

const VOTE_LABELS = ["5", "4", "3", "2", "1"];

// ─── Access Code Gate ──────────────────────────────────────────────────────────
function CodeGate({ onVerified }: { onVerified: (v: VerifiedState) => void }) {
  const [code, setCode]         = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setVerifying(true);
    try {
      const res = await fetch("/api/coaches-vote/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ accessCode: code.trim() }),
      });
      const data = await res.json() as { teamName?: string; gradeName?: string; error?: string };
      if (!res.ok) {
        setCodeError(data.error ?? "Invalid access code.");
        return;
      }
      const verified: VerifiedState = {
        teamName:  data.teamName!,
        gradeName: data.gradeName!,
        code:      code.trim().toUpperCase(),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(verified));
      onVerified(verified);
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
            <h1 className={styles.title}>Coaches Vote</h1>
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

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CoachesVotePage() {
  // Always start null on both server and client to avoid hydration mismatch.
  // After mount we read localStorage — the brief flash is avoided by showing
  // nothing until hydrated (no SSR content to mismatch against).
  const [verified, setVerified]   = useState<VerifiedState | null>(null);
  const [hydrated, setHydrated]   = useState(false);

  useEffect(() => {
    let initial: VerifiedState | null = null;
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as VerifiedState;
        if (parsed.teamName && parsed.gradeName && parsed.code) initial = parsed;
      }
    } catch { /* ignore malformed storage */ }
    // Batch both state updates in one callback so React only re-renders once
    startTransition(() => {
      setVerified(initial);
      setHydrated(true);
    });
  }, []);

  // Render nothing until client has hydrated — prevents server/client mismatch
  if (!hydrated) return null;

  if (!verified) {
    return <CodeGate onVerified={setVerified} />;
  }

  return <CoachesVoteForm verified={verified} onLogout={() => {
    localStorage.removeItem(LS_KEY);
    setVerified(null);
  }} />;
}

// ─── The actual form (shown once verified) ────────────────────────────────────
function CoachesVoteForm({
  verified,
  onLogout,
}: {
  verified: VerifiedState;
  onLogout: () => void;
}) {
  const grade    = verified.gradeName as CoachesVoteGrade;
  const coachTeam = verified.teamName;

  // ── Step: pick a match first, then fill votes ─────────────────────────────
  const [selectedFixture, setSelectedFixture] = useState<FixtureRow | null>(null);

  // ── Available (unvoted, played) fixtures for this team ────────────────────
  const [availableFixtures, setAvailableFixtures]   = useState<FixtureRow[]>([]);
  const [fixturesLoading, setFixturesLoading]       = useState(true);
  const [fixturesError, setFixturesError]           = useState<string | null>(null);

  // ── Players from both teams ────────────────────────────────────────────────
  const [homePlayers, setHomePlayers]   = useState<GamePlayer[]>([]);
  const [awayPlayers, setAwayPlayers]   = useState<GamePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  const allGamePlayers: GamePlayer[] = [
    ...homePlayers.map((p) => ({ ...p, firstName: `[H] ${p.firstName}` })),
    ...awayPlayers.map((p) => ({ ...p, firstName: `[A] ${p.firstName}` })),
  ];

  // ── Vote form state ───────────────────────────────────────────────────────
  const [players, setPlayers] = useState(
    Array.from({ length: 5 }, () => ({ number: "", name: "" }))
  );
  const [submitterName, setSubmitterName] = useState("");
  const [initials, setInitials]           = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // ── Load available fixtures on mount ──────────────────────────────────────
  useEffect(() => {
    setFixturesLoading(true);
    fetch(
      `/api/coaches-vote/fixtures?grade=${encodeURIComponent(grade)}&teamName=${encodeURIComponent(coachTeam)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAvailableFixtures(data as FixtureRow[]);
        else setFixturesError((data as { error: string }).error ?? "Failed to load fixtures.");
      })
      .catch(() => setFixturesError("Failed to load fixtures. Please refresh."))
      .finally(() => setFixturesLoading(false));
  }, [grade, coachTeam]);

  // ── Fetch players when a fixture is selected ──────────────────────────────
  useEffect(() => {
    if (!selectedFixture) {
      setHomePlayers([]);
      setAwayPlayers([]);
      return;
    }
    setPlayersLoading(true);
    const { id, homeTeamName, awayTeamName } = selectedFixture;
    Promise.all([
      fetch(`/api/game-players?gameId=${encodeURIComponent(id)}&teamName=${encodeURIComponent(homeTeamName)}`).then((r) => r.json()),
      fetch(`/api/game-players?gameId=${encodeURIComponent(id)}&teamName=${encodeURIComponent(awayTeamName)}`).then((r) => r.json()),
    ])
      .then(([homeData, awayData]) => {
        setHomePlayers((homeData as { players: GamePlayer[] }).players ?? []);
        setAwayPlayers((awayData as { players: GamePlayer[] }).players ?? []);
      })
      .catch(() => { setHomePlayers([]); setAwayPlayers([]); })
      .finally(() => setPlayersLoading(false));
  }, [selectedFixture]);

  function updatePlayer(idx: number, field: "number" | "name", value: string) {
    setPlayers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
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

    setSubmitting(true);
    try {
      const res = await fetch("/api/coaches-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessCode: verified.code,
          grade,
          round:     selectedFixture.roundName,
          matchDate: selectedFixture.matchDate,
          homeTeam:  selectedFixture.homeTeamName,
          awayTeam:  selectedFixture.awayTeamName,
          coachTeam,
          player1Number: players[0].number || null,
          player1Name:   players[0].name   || null,
          player2Number: players[1].number || null,
          player2Name:   players[1].name   || null,
          player3Number: players[2].number || null,
          player3Name:   players[2].name   || null,
          player4Number: players[3].number || null,
          player4Name:   players[3].name   || null,
          player5Number: players[4].number || null,
          player5Name:   players[4].name   || null,
          submitterName: submitterName.trim(),
          signatureDataUrl: initials.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedFixture(null);
    setPlayers(Array.from({ length: 5 }, () => ({ number: "", name: "" })));
    setSubmitterName("");
    setInitials("");
    setSubmitted(false);
    setError(null);
    // Re-fetch fixtures to remove the just-submitted one
    setFixturesLoading(true);
    fetch(
      `/api/coaches-vote/fixtures?grade=${encodeURIComponent(grade)}&teamName=${encodeURIComponent(coachTeam)}`
    )
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAvailableFixtures(data as FixtureRow[]); })
      .catch(() => {})
      .finally(() => setFixturesLoading(false));
  }

  // ── Loading / error guards ────────────────────────────────────────────────
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

  // ── Success ───────────────────────────────────────────────────────────────
  if (submitted && selectedFixture) {
    return (
      <div className={styles.page}>
        <div className={`${styles.card} ${styles.successCard}`}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>Votes Submitted!</h2>
          <p className={styles.successSub}>
            Coaches votes for <strong>{coachTeam}</strong> —{" "}
            {selectedFixture.homeTeamName} vs {selectedFixture.awayTeamName} on{" "}
            <strong>{selectedFixture.matchDate}</strong> have been recorded.
          </p>
          {availableFixtures.length > 1 ? (
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

  const hasPlayerData = homePlayers.length > 0 || awayPlayers.length > 0;

  // ── Header shared by both steps ───────────────────────────────────────────
  const header = (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Coaches Vote</h1>
        <p className={styles.sub}>
          Submitting as <strong>{coachTeam}</strong> &mdash;{" "}
          {grade.replace("SFL Community League ", "")}
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
                No completed matches available to vote on. Matches appear here once played and will disappear after votes are submitted.
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
              <p className={styles.sectionHint}>Choose the match you want to submit votes for.</p>
              <div className={matchStyles.matchList}>
                {availableFixtures.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={matchStyles.matchCard}
                    onClick={() => setSelectedFixture(f)}
                  >
                    <span className={matchStyles.matchRound}>{f.roundName}</span>
                    <span className={matchStyles.matchTeams}>
                      {f.homeTeamName} <span className={matchStyles.vs}>vs</span> {f.awayTeamName}
                    </span>
                    <span className={matchStyles.matchDate}>{f.matchDate}</span>
                    {f.venueName && <span className={matchStyles.matchVenue}>{f.venueName}</span>}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Submit votes for selected match ───────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {header}

        <form onSubmit={handleSubmit} className={styles.formBody}>

          {/* ── Selected Match ── */}
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

          {/* ── Player Votes ── */}
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Player Votes</div>
            <p className={styles.sectionHint}>
              {playersLoading
                ? "Loading team players…"
                : hasPlayerData
                ? "Select your top 5 players from either team. [H] = Home team, [A] = Away team."
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
                          onNumberChange={(v) => updatePlayer(i, "number", v)}
                          onNameChange={(v) => updatePlayer(i, "name", v)}
                          onSelect={(num, name) => {
                            updatePlayer(i, "number", num);
                            updatePlayer(i, "name", name.replace(/^\[(H|A)\] /, ""));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Sign Off ── */}
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
                placeholder="e.g. JD"
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
