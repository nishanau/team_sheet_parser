"use client";

import { useRef, useState, useEffect, useCallback } from "react";
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

// ─── Signature Canvas ─────────────────────────────────────────────────────────
function SignatureCanvas({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e instanceof MouseEvent) {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
    const touch = (e as TouchEvent).touches[0];
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    lastPos.current = getPos(e, canvas);
  }, []);

  const draw = useCallback(
    (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!drawing.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const pos = getPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      lastPos.current = pos;
      hasDrawn.current = true;
    },
    []
  );

  const endDraw = useCallback(() => {
    drawing.current = false;
    lastPos.current = null;
    if (hasDrawn.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  }, [onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", endDraw);
    canvas.addEventListener("mouseleave", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", endDraw);
    return () => {
      canvas.removeEventListener("mousedown", startDraw);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", endDraw);
      canvas.removeEventListener("mouseleave", endDraw);
      canvas.removeEventListener("touchstart", startDraw);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", endDraw);
    };
  }, [startDraw, draw, endDraw]);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onChange(null);
  }

  return (
    <div className={styles.sigWrap}>
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        className={styles.sigCanvas}
      />
      <button type="button" className={styles.sigClear} onClick={clear}>
        Clear
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BestAndFairestPage() {
  // ── Form state ───────────────────────────────────────────────────────────
  const [competition, setCompetition]           = useState("");
  const [matchDate, setMatchDate]               = useState(getTasmanianDate);
  const [ageGroup, setAgeGroup]                 = useState("");
  const [opposition, setOpposition]             = useState("");
  const [players, setPlayers]                   = useState(
    Array.from({ length: 5 }, () => ({ number: "", name: "" }))
  );
  const [submitterName, setSubmitterName]       = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting]             = useState(false);
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!submitterName.trim()) {
      setError("Please enter your name before submitting.");
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
          signatureDataUrl,
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
    setPlayers(Array.from({ length: 5 }, () => ({ number: "", name: "" })));
    setSubmitterName("");
    setSignatureDataUrl(null);
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
                        />
                      </td>
                      <td className={styles.td}>
                        <input
                          type="text"
                          className={`${styles.tableInput} ${styles.tableInputName}`}
                          placeholder="Player name"
                          value={p.name}
                          onChange={(e) => updatePlayer(i, "name", e.target.value)}
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

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Signature</label>
              <p className={styles.sectionHint} style={{ marginBottom: 8 }}>
                Sign in the box below using your mouse or finger.
              </p>
              <SignatureCanvas onChange={setSignatureDataUrl} />
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
