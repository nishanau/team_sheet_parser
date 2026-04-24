"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import Select from "@/app/components/Select";
import { COMPETITIONS, CV_GRADES, GRADE_MAP, ROUND_OPTIONS } from "@/lib/constants";
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
  | { mode: "round"; rows: RoundRow[]; rounds: string[]; totals: { bf: number; coaches: number } }
  | { mode: "pivot"; rows: PivotRow[]; rounds: string[]; totals: { bf: number; coaches: number } };

function allGradesFor(competition: string) {
  return Object.entries(GRADE_MAP)
    .filter(([key]) => key.startsWith(competition))
    .flatMap(([, grades]) => grades)
    .filter((g) => g.length > 0);
}

function readInitialParam(urlKey: string, storageKey: string, fallback = "") {
  const urlVal = new URLSearchParams(window.location.search).get(urlKey);
  if (urlVal !== null) return urlVal;
  return sessionStorage.getItem(storageKey) ?? fallback;
}

function exportRoundCSV(rows: RoundRow[], grade: string, round: string) {
  const headers = "Rank,Player,Number,Team,Round Votes,Total Votes";
  const lines = rows.map(
    (r) => `${r.rank},"${r.playerName}","${r.playerNumber ?? ""}","${r.team}",${r.roundVotes},${r.totalVotes}`,
  );
  const blob = new Blob([[headers, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `leaderboard-${grade}-${round}.csv`,
  });
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
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `leaderboard-${grade}-all.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const isSuperadmin = session?.user?.role === "superadmin";

  // Use stable defaults for SSR/first client render, then restore URL/session state after mount.
  const [tab, setTab] = useState<"bf" | "coaches">("bf");
  const [competition, setCompetition] = useState("SFL");
  const [grade, setGrade] = useState("");
  const [round, setRound] = useState("all");
  const [filtersReady, setFiltersReady] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const sessionScopedGrades = session?.user?.scopedGrades ?? null;
  const hasCoachesTab = session?.user?.hasCoachesTab ?? isSuperadmin;

  const allBfGrades = isSuperadmin ? allGradesFor(competition) : (sessionScopedGrades ?? []);
  const grades = tab === "coaches" ? [...CV_GRADES] : allBfGrades;

  useEffect(() => {
    const nextTab = readInitialParam("tab", "lb:tab");
    const nextCompetition = readInitialParam("competition", "lb:competition", "SFL");
    const nextGrade = readInitialParam("grade", "lb:grade");
    const nextRound = readInitialParam("round", "lb:round", "all");

    setTab(nextTab === "coaches" ? "coaches" : "bf");
    setCompetition(nextCompetition);
    setGrade(nextGrade);
    setRound(nextRound);
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;

    sessionStorage.setItem("lb:tab", tab);
    sessionStorage.setItem("lb:competition", competition);
    sessionStorage.setItem("lb:grade", grade);
    sessionStorage.setItem("lb:round", round);

    const params = new URLSearchParams();
    if (tab !== "bf") params.set("tab", tab);
    if (competition !== "SFL") params.set("competition", competition);
    if (grade) params.set("grade", grade);
    if (round !== "all") params.set("round", round);

    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filtersReady, tab, competition, grade, round]);

  function handleCompetitionChange(val: string) {
    setCompetition(val);
    setGrade("");
  }

  useEffect(() => {
    if (!filtersReady || !grade) return;

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

    return () => {
      cancelled = true;
    };
  }, [filtersReady, tab, competition, grade, round]);

  useEffect(() => {
    if (grade && !grades.includes(grade)) {
      setGrade("");
      setData(null);
    }
  }, [grade, grades]);

  useEffect(() => {
    if (!grade) setData(null);
  }, [grade]);

  const isEmpty = !data || data.rows.length === 0;

  function handleExport() {
    if (!data || isEmpty) return;
    if (data.mode === "pivot") exportPivotCSV(data.rows, data.rounds, grade);
    else exportRoundCSV(data.rows, grade, round);
  }

  const pivotTotals = (() => {
    if (!data || isEmpty || data.mode !== "pivot") return null;
    const byRound: Record<string, number> = {};
    for (const rnd of data.rounds) {
      byRound[rnd] = data.rows.reduce((s, r) => s + (r.roundBreakdown[rnd] ?? 0), 0);
    }
    return { byRound, grand: Object.values(byRound).reduce((a, b) => a + b, 0) };
  })();

  const roundTotals = (() => {
    if (!data || isEmpty || data.mode !== "round") return null;
    return {
      round: data.rows.reduce((s, r) => s + r.roundVotes, 0),
      total: data.rows.reduce((s, r) => s + r.totalVotes, 0),
    };
  })();

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
            onClick={() => {
              setTab("bf");
              setGrade("");
            }}
          >
            Best &amp; Fairest
          </button>
          <button
            className={`${styles.tab} ${tab === "coaches" ? styles.tabActive : ""}`}
            onClick={() => {
              setTab("coaches");
              setCompetition("SFL");
              setGrade("");
            }}
          >
            Coaches Votes
          </button>
        </div>
      )}

      <div className={styles.filters}>
        {isSuperadmin && tab === "bf" && (
          <Select value={competition} onChange={handleCompetitionChange} options={COMPETITIONS} />
        )}
        <Select
          value={grade}
          onChange={setGrade}
          options={grades}
          placeholder="Select Grade"
          className={styles.gradeSelect}
          triggerClassName={styles.gradeTrigger}
        />
        <Select value={round} onChange={setRound} options={["all", ...ROUND_OPTIONS]} />
      </div>

      {loading ? (
        <p className={styles.hint}>Loading...</p>
      ) : isEmpty ? (
        <p className={styles.hint}>No votes found for the selected filters.</p>
      ) : data.mode === "pivot" ? (
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
                  <td className={styles.td}>{r.playerNumber ?? "-"}</td>
                  <td className={styles.td}>{r.team}</td>
                  {data.rounds.map((rnd) => (
                    <td key={rnd} className={`${styles.td} ${styles.tdCenter}`}>
                      {r.roundBreakdown[rnd] ?? "-"}
                    </td>
                  ))}
                  <td className={`${styles.td} ${styles.tdCenter}`}>
                    <strong>{r.totalVotes}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={styles.tfootRow}>
                <td className={styles.td} />
                <td className={`${styles.td} ${styles.tfootLabel}`} colSpan={3}>Total votes</td>
                {data.rounds.map((rnd) => (
                  <td key={rnd} className={`${styles.td} ${styles.tdCenter}`}>
                    <strong>{pivotTotals!.byRound[rnd] ?? 0}</strong>
                  </td>
                ))}
                <td className={`${styles.td} ${styles.tdCenter}`}>
                  <strong>{pivotTotals!.grand}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
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
                <td className={styles.td}>{r.playerNumber ?? "-"}</td>
                <td className={styles.td}>{r.team}</td>
                <td className={`${styles.td} ${styles.tdCenter}`}>{r.roundVotes || "-"}</td>
                <td className={`${styles.td} ${styles.tdCenter}`}>
                  <strong>{r.totalVotes}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.tfootRow}>
              <td className={styles.td} />
              <td className={`${styles.td} ${styles.tfootLabel}`} colSpan={3}>Total votes</td>
              <td className={`${styles.td} ${styles.tdCenter}`}>
                <strong>{roundTotals!.round}</strong>
              </td>
              <td className={`${styles.td} ${styles.tdCenter}`}>
                <strong>{roundTotals!.total}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      {data && (
        <p className={styles.totals}>
          Best &amp; Fairest submissions: <strong>{data.totals.bf}</strong>
          {" · "}
          Coaches Vote submissions: <strong>{data.totals.coaches}</strong>
        </p>
      )}
    </div>
  );
}
