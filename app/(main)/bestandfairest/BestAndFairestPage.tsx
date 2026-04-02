"use client";

import { useState, useEffect } from "react";
import styles from "./BestAndFairest.module.css";
import selectStyles from "../../components/Select.module.css";
import Select from "../../components/Select";
import PlayerInput from "../../components/PlayerInput";
import type { GamePlayer } from "@/app/api/game-players/route";
import { ROUND_OPTIONS } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface GradeData {
  name: string;
  teams: string[];
}
interface AgeGroupData {
  name: string;
  grades: GradeData[];
  teams: string[]; // STJFL hardcoded flat list
}
interface LeagueData {
  name: string;
  ageGroups: AgeGroupData[];
}

// Vote weight labels: row 1 = 5 votes … row 5 = 1 vote
const VOTE_LABELS = ["5", "4", "3", "2", "1"];

// Get today's date in AEST/AEDT (Tasmania)
function getTasmanianDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Hobart",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BestAndFairestPage() {
  // ── Form state ───────────────────────────────────────────────────────────
  const [competition, setCompetition] = useState("");
  const [matchDate, setMatchDate]     = useState(getTasmanianDate);
  const [ageGroup, setAgeGroup]       = useState("");
  const [grade, setGrade]             = useState("");
  const [homeTeam, setHomeTeam]       = useState("");
  const [opposition, setOpposition]   = useState("");
  const [round, setRound]             = useState(ROUND_OPTIONS[0]);
  const [players, setPlayers]         = useState(
    Array.from({ length: 5 }, () => ({ number: "", name: "" }))
  );
  const [submitterName, setSubmitterName] = useState("");
  const [initials, setInitials]           = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [fixtureFound, setFixtureFound]     = useState<string | null>(null); // info hint
  const [fixtureGameId, setFixtureGameId]   = useState<string | null>(null); // PlayHQ game id
  const [gamePlayers, setGamePlayers]       = useState<GamePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  // ── League data from DB ──────────────────────────────────────────────────
  const [leagueData, setLeagueData]   = useState<LeagueData[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((data: LeagueData[]) => {
        setLeagueData(data);
        if (data.length > 0) {
          const firstLeague   = data[0];
          const firstAgeGroup = firstLeague.ageGroups[0];
          const firstGrade    = firstAgeGroup?.grades[0];
          setCompetition(firstLeague.name);
          setAgeGroup(firstAgeGroup?.name ?? "");
          setGrade(firstGrade?.name ?? "");
        }
      })
      .catch(() => setDataError("Failed to load league data. Please refresh."))
      .finally(() => setDataLoading(false));
  }, []);

  // ── Auto-fill Opposition from fixture when grade + round + homeTeam all set ──
  useEffect(() => {
    if (!grade || !homeTeam || !round) return;
    setFixtureLoading(true);
    setFixtureFound(null);
    fetch(
      `/api/fixtures?grade=${encodeURIComponent(grade)}&homeTeam=${encodeURIComponent(homeTeam)}&round=${encodeURIComponent(round)}`
    )
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setOpposition(rows[0].awayTeamName);
          setFixtureFound(`vs ${rows[0].awayTeamName}`);
          setFixtureGameId(rows[0].id ?? null);
        } else {
          setOpposition("");
          setFixtureFound(null);
          setFixtureGameId(null);
        }
      })
      .catch(() => setFixtureFound(null))
      .finally(() => setFixtureLoading(false));
  }, [grade, homeTeam, round]);

  // ── Fetch game players from DB/PlayHQ once fixture + both teams are resolved ──
  useEffect(() => {
    if (!fixtureGameId || !homeTeam || !opposition) { setGamePlayers([]); return; }
    setPlayersLoading(true);
    Promise.all([
      fetch(`/api/game-players?gameId=${encodeURIComponent(fixtureGameId)}&teamName=${encodeURIComponent(homeTeam)}`).then((r) => r.json()),
      fetch(`/api/game-players?gameId=${encodeURIComponent(fixtureGameId)}&teamName=${encodeURIComponent(opposition)}`).then((r) => r.json()),
    ])
      .then(([homeData, awayData]: [{ players: GamePlayer[] }, { players: GamePlayer[] }]) => {
        setGamePlayers([...(homeData.players ?? []), ...(awayData.players ?? [])]);
      })
      .catch(() => setGamePlayers([]))
      .finally(() => setPlayersLoading(false));
  }, [fixtureGameId, homeTeam, opposition]);

  // ── Derived lists ─────────────────────────────────────────────────────────
  const currentLeague    = leagueData.find((l) => l.name === competition);
  const currentAgeGroups = currentLeague?.ageGroups ?? [];
  const currentAgeGroup  = currentAgeGroups.find((ag) => ag.name === ageGroup);
  const currentGrades    = currentAgeGroup?.grades ?? [];
  const showGrade        = currentGrades.length > 0;

  // Teams come from the selected grade (SFL) or the flat STJFL list
  const currentGradeData = currentGrades.find((g) => g.name === grade);
  const allTeams: string[] = showGrade
    ? (currentGradeData?.teams ?? [])
    : (currentAgeGroup?.teams ?? []);
  const oppositionTeams = allTeams.filter((t) => t !== homeTeam);

  // ── Cascade handlers ─────────────────────────────────────────────────────
  function handleCompetitionChange(name: string) {
    const league  = leagueData.find((l) => l.name === name);
    const firstAg = league?.ageGroups[0];
    const firstGr = firstAg?.grades[0];
    setCompetition(name);
    setAgeGroup(firstAg?.name ?? "");
    setGrade(firstGr?.name ?? "");
    setHomeTeam("");
    setOpposition("");
    setFixtureFound(null);
  }

  function handleAgeGroupChange(ag: string) {
    const ageGroupData = currentLeague?.ageGroups.find((a) => a.name === ag);
    const firstGrade   = ageGroupData?.grades[0];
    setAgeGroup(ag);
    setGrade(firstGrade?.name ?? "");
    setHomeTeam("");
    setOpposition("");
    setFixtureFound(null);
  }

  const emptyPlayers = () => Array.from({ length: 5 }, () => ({ number: "", name: "" }));

  function handleGradeChange(g: string) {
    setGrade(g);
    setHomeTeam("");
    setOpposition("");
    setFixtureFound(null);
    setFixtureGameId(null);
    setGamePlayers([]);
    setPlayers(emptyPlayers());
  }

  function handleRoundChange(r: string) {
    setRound(r);
    setOpposition("");
    setFixtureFound(null);
    setFixtureGameId(null);
    setGamePlayers([]);
    setPlayers(emptyPlayers());
  }

  function handleHomeTeamChange(t: string) {
    setHomeTeam(t);
    setOpposition("");
    setFixtureFound(null);
    setFixtureGameId(null);
    setGamePlayers([]);
    setPlayers(emptyPlayers());
  }

  function handleOppositionChange(t: string) {
    setOpposition(t);
    setPlayers(emptyPlayers());
  }

  function updatePlayer(idx: number, field: "number" | "name", value: string) {
    setPlayers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!submitterName.trim()) {
      setError("Please enter your name before submitting.");
      return;
    }
    if (!initials.trim()) {
      setError("Please enter your initials before submitting.");
      return;
    }

    // Duplicate player number check
    const enteredNumbers = players.map((p) => p.number.trim()).filter(Boolean);
    const uniqueNumbers  = new Set(enteredNumbers);
    if (uniqueNumbers.size !== enteredNumbers.length) {
      const seen  = new Set<string>();
      const dupes = enteredNumbers.filter((n) => seen.size === seen.add(n).size);
      setError(`Duplicate player number${dupes.length > 1 ? "s" : ""}: ${[...new Set(dupes)].join(", ")}. Each player must have a unique number.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/best-and-fairest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competition,
          matchDate,
          ageGroup,
          grade:     showGrade ? grade : null,
          homeTeam,
          opposition,
          round,
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
    setMatchDate(getTasmanianDate());
    const first   = leagueData[0];
    const firstAg = first?.ageGroups[0];
    const firstGr = firstAg?.grades[0];
    setCompetition(first?.name ?? "");
    setAgeGroup(firstAg?.name ?? "");
    setGrade(firstGr?.name ?? "");
    setRound(ROUND_OPTIONS[0]);
    setHomeTeam("");
    setOpposition("");
    setFixtureFound(null);
    setPlayers(Array.from({ length: 5 }, () => ({ number: "", name: "" })));
    setSubmitterName("");
    setInitials("");
    setSubmitted(false);
    setError(null);
  }

  // ── Data loading / error guard ────────────────────────────────────────────
  if (dataLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <p className={styles.sub} style={{ padding: "24px" }}>Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.errorBanner} style={{ margin: 24 }}>{dataError}</div>
        </div>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={`${styles.card} ${styles.successCard}`}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>Votes Submitted!</h2>
          <p className={styles.successSub}>
            Best &amp; Fairest votes for <strong>{homeTeam}</strong> vs{" "}
            <strong>{opposition}</strong> on <strong>{matchDate}</strong> have been recorded.
          </p>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleReset}>
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Best &amp; Fairest Votes</h1>
            <p className={styles.sub}>
              Complete and sign the voting form after each match.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.formBody}>

          {/* ── Match Details ── */}
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Match Details</div>
            {/* Row 1 — What game: Competition › Age Group › Grade */}
            <div className={styles.fieldRow}>

              <div className={`${styles.fieldGroup} ${styles.fieldGroupNarrow}`}>
                <label className={styles.label} htmlFor="competition">Competition</label>
                <Select
                  id="competition"
                  value={competition}
                  onChange={handleCompetitionChange}
                  options={leagueData.map((l) => l.name)}
                  required
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="ageGroup">Age Group</label>
                <Select
                  id="ageGroup"
                  value={ageGroup}
                  onChange={handleAgeGroupChange}
                  options={currentAgeGroups.map((ag) => ag.name)}
                  required
                />
              </div>

              {showGrade && (
                <div className={`${styles.fieldGroup} ${styles.fieldGroupWide}`}>
                  <label className={styles.label} htmlFor="grade">Grade</label>
                  <Select
                    id="grade"
                    value={grade}
                    onChange={handleGradeChange}
                    options={currentGrades.map((g) => g.name)}
                    required
                    triggerClassName={selectStyles.triggerWrap}
                  />
                </div>
              )}

            </div>

            {/* Row 2 — When: Round + Date */}
            <div className={styles.fieldRow}>

              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="round">Round</label>
                <Select
                  id="round"
                  value={round}
                  onChange={handleRoundChange}
                  options={ROUND_OPTIONS}
                  required
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="matchDate">Date</label>
                <input
                  id="matchDate"
                  type="date"
                  className={styles.input}
                  value={matchDate}
                  onChange={(e) => setMatchDate(e.target.value)}
                  required
                />
              </div>

            </div>

            {/* Row 3 — Who: Home Team + Opposition */}
            <div className={styles.fieldRow}>

              <div className={`${styles.fieldGroup} ${styles.fieldGroupHalf}`}>
                <label className={styles.label} htmlFor="homeTeam">Home Team</label>
                <Select
                  id="homeTeam"
                  value={homeTeam}
                  onChange={handleHomeTeamChange}
                  options={allTeams}
                  required
                />
                {fixtureLoading && (
                  <p className={styles.fieldHint}>Looking up opposition…</p>
                )}
                {fixtureFound && !fixtureLoading && (
                  <p className={styles.fieldHint}>✓ Auto-filled: {fixtureFound}</p>
                )}
              </div>

              <div className={`${styles.fieldGroup} ${styles.fieldGroupHalf}`}>
                <label className={styles.label} htmlFor="opposition">Opposition</label>
                <Select
                  id="opposition"
                  value={opposition}
                  onChange={handleOppositionChange}
                  options={oppositionTeams}
                  required
                />
              </div>

            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>Player Votes</div>
            <p className={styles.sectionHint}>
              {gamePlayers.length > 0
                ? "Type a jumper number or name to search players from both teams."
                : playersLoading
                ? "Loading players…"
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
                          players={gamePlayers}
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

          {/* ── Sign-off ── */}
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Sign Off</div>

            <div className={styles.fieldGroup} style={{ maxWidth: 360, marginBottom: 20 }}>
              <label className={styles.label} htmlFor="submitterName">
                Your Name
              </label>
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

          {/* ── Error ── */}
          {error && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          {/* ── Submit ── */}
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