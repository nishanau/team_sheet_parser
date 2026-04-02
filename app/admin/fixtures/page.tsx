"use client";
import { useState, useEffect } from "react";
import Select from "@/app/components/Select";
import { ALLOWED_GRADES, ROUND_OPTIONS } from "@/lib/constants";
import styles from "../shared.module.css";

type Fixture = { id: string; gradeName: string; roundName: string; matchDate: string; homeTeamName: string; awayTeamName: string; venueName: string | null };

export default function FixturesPage() {
  const [grade,    setGrade]    = useState("");
  const [round,    setRound]    = useState("");
  const [rows,     setRows]     = useState<Fixture[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (grade) params.set("grade", grade);
    if (round) params.set("round", round);
    setLoading(true);
    fetch(`/api/admin/fixtures?${params}`)
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, [grade, round]);

  return (
    <div>
      <h1 className={styles.pageTitle}>Fixtures</h1>
      <div className={styles.filters}>
        <Select value={grade} onChange={setGrade} options={["", ...Array.from(ALLOWED_GRADES)]} />
        <Select value={round} onChange={setRound} options={["", ...ROUND_OPTIONS]} />
      </div>
      {loading ? <p className={styles.hint}>Loading…</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Grade</th>
              <th className={styles.th}>Round</th>
              <th className={styles.th}>Date</th>
              <th className={styles.th}>Home</th>
              <th className={styles.th}>Away</th>
              <th className={styles.th}>Venue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className={styles.tr}>
                <td className={styles.td}>{f.gradeName}</td>
                <td className={styles.td}>{f.roundName}</td>
                <td className={styles.td}>{f.matchDate}</td>
                <td className={styles.td}>{f.homeTeamName}</td>
                <td className={styles.td}>{f.awayTeamName}</td>
                <td className={styles.td}>{f.venueName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
