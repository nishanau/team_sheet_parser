"use client";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

import Select from "@/app/components/Select";
import { ROUND_OPTIONS, GRADE_MAP } from "@/lib/constants";
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

  const grades = allGradesFor(competition);

  useEffect(() => {
    if (grades.length > 0 && !grades.includes(grade)) setGrade(grades[0]);
  }, [competition]);

  useEffect(() => {
    if (!grade) return;
    const params = new URLSearchParams({ type: tab, competition, round });
    if (grade) params.set("grade", grade);
    setLoading(true);
    fetch(`/api/admin/leaderboard?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
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

      {isSuperadmin && (
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "bf" ? styles.tabActive : ""}`}
            onClick={() => setTab("bf")}
          >
            Best &amp; Fairest
          </button>
          <button
            className={`${styles.tab} ${tab === "coaches" ? styles.tabActive : ""}`}
            onClick={() => setTab("coaches")}
          >
            Coaches Votes
          </button>
        </div>
      )}

      <div className={styles.filters}>
        {tab === "bf" && (
          <Select value={competition} onChange={setCompetition} options={COMPETITIONS} />
        )}
        <Select value={grade} onChange={setGrade} options={grades} />
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

