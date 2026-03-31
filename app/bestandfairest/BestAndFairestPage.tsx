"use client";

import { useState, useEffect } from "react";
import styles from "./BestAndFairest.module.css";
import Select from "../components/Select";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeagueData {
  id: number;
  name: string;
  ageGroups: string[];
  teams: string[];
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

// Round options: 1–22 plus Finals
const ROUND_OPTIONS = [
  ...Array.from({ length: 22 }, (_, i) => `Round ${i + 1}`),
  "Finals Week 1",
  "Finals Week 2",
  "Finals Week 3",
  "Grand Final",
];

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BestAndFairestPage() {
  // ── Form state ───────────────────────────────────────────────────────────
  const [competition, setCompetition]           = useState("");
  const [matchDate, setMatchDate]               = useState(getTasmanianDate);
  const [ageGroup, setAgeGroup]                 = useState("");
  const [opposition, setOpposition]             = useState("");
  const [round, setRound]                       = useState(ROUND_OPTIONS[0]);
  const [players, setPlayers]                   = useState(
    Array.from({ length: 5 }, () => ({ number: "", name: "" }))
  );
  const [submitterName, setSubmitterName] = useState("");
  const [initials, setInitials]           = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]               = useState(false);
  const [error, setError]                       = useState<string | null>(null);

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
          setCompetition(data[0].name);
          setAgeGroup(data[0].ageGroups[0] ?? "");
          setOpposition(data[0].teams[0] ?? "");
        }
      })
      .catch(() => setDataError("Failed to load league data. Please refresh."))
      .finally(() => setDataLoading(false));
  }, []);

  // Derived lists for the currently selected competition
  const currentLeague    = leagueData.find((l) => l.name === competition);
  const currentAgeGroups = currentLeague?.ageGroups ?? [];
  const currentTeams     = currentLeague?.teams ?? [];

  function updatePlayer(idx: number, field: "number" | "name", value: string) {
    setPlayers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function handleCompetitionChange(name: string) {
    const league = leagueData.find((l) => l.name === name);
    setCompetition(name);
    setAgeGroup(league?.ageGroups[0] ?? "");
    setOpposition(league?.teams[0] ?? "");
    // round stays as-is when competition changes
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
    const uniqueNumbers = new Set(enteredNumbers);
    if (uniqueNumbers.size !== enteredNumbers.length) {
      const seen = new Set<string>();
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
    const first = leagueData[0];
    setCompetition(first?.name ?? "");
    setAgeGroup(first?.ageGroups[0] ?? "");
    setOpposition(first?.teams[0] ?? "");
    setRound(ROUND_OPTIONS[0]);
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
            Best &amp; Fairest votes for <strong>{opposition}</strong> on{" "}
            <strong>{matchDate}</strong> have been recorded.
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
            <div className={styles.fieldRow}>

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

              <div className={styles.fieldGroup}>
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
                  onChange={setAgeGroup}
                  options={currentAgeGroups}
                  required
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="opposition">Opposition</label>
                <Select
                  id="opposition"
                  value={opposition}
                  onChange={setOpposition}
                  options={currentTeams}
                  required
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="round">Round</label>
                <Select
                  id="round"
                  value={round}
                  onChange={setRound}
                  options={ROUND_OPTIONS}
                  required
                />
              </div>

            </div>
          </section>

          {/* ── Vote Table ── */}
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Player Votes</div>
            <p className={styles.sectionHint}>
              Enter the player number and name for each vote position.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th} style={{ width: 56 }}>Votes</th>
                    <th className={styles.th} style={{ width: 90 }}>Number</th>
                    <th className={styles.th}>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={i} className={styles.tr}>
                      <td className={styles.td}>
                        <span className={styles.voteBadge}>{VOTE_LABELS[i]}</span>
                      </td>
                      <td className={styles.td}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={styles.tableInput}
                          placeholder="#"
                          value={p.number}
                          onChange={(e) => updatePlayer(i, "number", e.target.value)}
                          maxLength={4}
                          required
                        />
                      </td>
                      <td className={styles.td}>
                        <input
                          type="text"
                          className={`${styles.tableInput} ${styles.tableInputName}`}
                          placeholder="Player name"
                          value={p.name}
                          onChange={(e) => updatePlayer(i, "name", e.target.value)}
                          required
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
