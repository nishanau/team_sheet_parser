"use client";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

import Select from "@/app/components/Select";
import { ROUND_OPTIONS, GRADE_MAP, CV_GRADES } from "@/lib/constants";
import styles from "./leaderboard.module.css";

type RoundRow = {
  rank: number;
  playerName: string;
  playerNumber: string | null;
  team: string;
  roundVotes: number;
  totalVotes: number;
};

type PivotRow = {
  rank: number;
  playerName: string;
  playerNumber: string | null;
  team: string;
  roundBreakdown: Record<string, number>;
  totalVotes: number;
};

type ApiResponse =
  | { mode: "round"; rows: RoundRow[]; rounds: string[] }
  | { mode: "pivot"; rows: PivotRow[]; rounds: string[] };

const COMPETITIONS = ["SFL", "STJFL"];

function allGradesFor(competition: string) {
  return Object.entries(GRADE_MAP)
    .filter(([key]) => key.startsWith(competition))
    .flatMap(([, grades]) => grades)
    .filter((g) => g.length > 0);
}

function exportRoundCSV(rows: RoundRow[], grade: string, round: string) {
  const headers = "Rank,Player,Number,Team,Round Votes,Total Votes";
  const lines = rows.map(
    (r) => `${r.rank},"${r.playerName}","${r.playerNumber ?? ""}","${r.team}",${r.roundVotes},${r.totalVotes}`
  );
  const blob = new Blob([[headers, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `leaderboard-${grade}-${round}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

function exportPivotCSV(rows: PivotRow[], rounds: string[], grade: string) {
  const roundCols = rounds.join(",");
  const headers = `Rank,Player,Number,Team,${roundCols},Total`;
  const lines = rows.map((r) => {
    const roundVals = rounds.map((rnd) => r.roundBreakdown[rnd] ?? 0).join(",");
    return `${r.rank},"${r.playerName}","${r.playerNumber ?? ""}","${r.team}",${roundVals},${r.totalVotes}`;
  });
  const blob = new Blob([[headers, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `leaderboard-${grade}-all.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const isSuperadmin = session?.user?.role === "superadmin";

  const [tab, setTab] = useState<"bf" | "coaches">("bf");
  const [competition, setCompetition] = useState("SFL");
  const [grade, setGrade] = useState("");
  const [round, setRound] = useState("all");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // scopedGrades is baked into the session at login for club admins — no API round-trip needed
  const sessionScopedGrades = session?.user?.scopedGrades ?? null;

  // hasCoachesTab is baked into the session at login — no API round-trip needed
  const hasCoachesTab = session?.user?.hasCoachesTab ?? isSuperadmin;

  // Grade options depend on active tab and role:
  // • coaches: always the CV_GRADES list
  // • bf superadmin: all grades for the selected competition (available synchronously)
  // • bf club admin: their grades from the session token (available as soon as session loads)
  const allBfGrades = isSuperadmin
    ? allGradesFor(competition)
    : (sessionScopedGrades ?? []);
  const grades = tab === "coaches" ? [...CV_GRADES] : allBfGrades;

  // Reset grade when competition changes — done in the setter, not an effect
  function handleCompetitionChange(val: string) {
    setCompetition(val);
    setGrade("");
  }

  useEffect(() => {
    if (!grade) return;
    const params = new URLSearchParams({ type: tab, competition, round });
    params.set("grade", grade);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res: ApiResponse = await fetch(`/api/admin/leaderboard?${params}`).then((r) => r.json());
        if (cancelled) return;
        setData(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, competition, grade, round]);

  const isEmpty = !data || data.rows.length === 0;

  function handleExport() {
    if (!data || isEmpty) return;
    if (data.mode === "pivot") exportPivotCSV(data.rows, data.rounds, grade);
    else exportRoundCSV(data.rows, grade, round);
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Leaderboard</h1>
        <button className={styles.exportBtn} onClick={handleExport} disabled={isEmpty}>
          Export CSV
        </button>
      </div>

      {hasCoachesTab && (
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "bf" ? styles.tabActive : ""}`}
            onClick={() => { setTab("bf"); setGrade(""); }}
          >
            Best &amp; Fairest
          </button>
          <button
            className={`${styles.tab} ${tab === "coaches" ? styles.tabActive : ""}`}
            onClick={() => { setTab("coaches"); setCompetition("SFL"); setGrade(""); }}
          >
            Coaches Votes
          </button>
        </div>
      )}

      <div className={styles.filters}>
        {isSuperadmin && tab === "bf" && (
          <Select value={competition} onChange={handleCompetitionChange} options={COMPETITIONS} />
        )}
        <Select value={grade} onChange={setGrade} options={grades} placeholder="Select Grade" className={styles.gradeSelect} triggerClassName={styles.gradeTrigger} />
        <Select value={round} onChange={setRound} options={["all", ...ROUND_OPTIONS]} />
      </div>

      {loading ? (
        <p className={styles.hint}>Loading…</p>
      ) : isEmpty ? (
        <p className={styles.hint}>No votes found for the selected filters.</p>
      ) : data.mode === "pivot" ? (
        /* ── Pivot table: All rounds ─────────────────────────────── */
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>#</th>
                <th className={styles.th}>Player</th>
                <th className={styles.th}>No.</th>
                <th className={styles.th}>Team</th>
                {data.rounds.map((r) => (
                  <th key={r} className={`${styles.th} ${styles.thRound}`}>{r}</th>
                ))}
                <th className={styles.th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={`${r.playerName}-${r.playerNumber}-${r.team}`} className={styles.tr}>
                  <td className={styles.td}>{r.rank}</td>
                  <td className={styles.td}>{r.playerName}</td>
                  <td className={styles.td}>{r.playerNumber ?? "—"}</td>
                  <td className={styles.td}>{r.team}</td>
                  {data.rounds.map((rnd) => (
                    <td key={rnd} className={`${styles.td} ${styles.tdCenter}`}>
                      {r.roundBreakdown[rnd] ?? "—"}
                    </td>
                  ))}
                  <td className={`${styles.td} ${styles.tdCenter}`}>
                    <strong>{r.totalVotes}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Single round table ──────────────────────────────────── */
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>#</th>
              <th className={styles.th}>Player</th>
              <th className={styles.th}>No.</th>
              <th className={styles.th}>Team</th>
              <th className={styles.th}>Round Votes</th>
              <th className={styles.th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={`${r.playerName}-${r.playerNumber}-${r.team}`} className={styles.tr}>
                <td className={styles.td}>{r.rank}</td>
                <td className={styles.td}>{r.playerName}</td>
                <td className={styles.td}>{r.playerNumber ?? "—"}</td>
                <td className={styles.td}>{r.team}</td>
                <td className={`${styles.td} ${styles.tdCenter}`}>{r.roundVotes || "—"}</td>
                <td className={`${styles.td} ${styles.tdCenter}`}>
                  <strong>{r.totalVotes}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

