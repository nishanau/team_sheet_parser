"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import styles from "./alerts.module.css";

type Alert = { type: string; grade: string | null; round: string; team: string | null; count: number; firstDate: string; lastDate: string };

export default function AlertsPage() {
  const { data: session }   = useSession();
  const isSuperadmin        = session?.user?.role === "superadmin";
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/admin/alerts")
      .then((r) => r.json())
      .then(setAlerts)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1 className={styles.title}>Duplicate Submission Alerts</h1>
      {alerts.length === 0 ? (
        <p className={styles.empty}>No duplicate submissions found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Grade</th>
              <th className={styles.th}>Round</th>
              <th className={styles.th}>Team</th>
              <th className={styles.th}>Count</th>
              <th className={styles.th}>First</th>
              <th className={styles.th}>Last</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => (
              <tr key={i} className={styles.tr}>
                <td className={styles.td}><span className={a.type === "bf" ? styles.badgeBf : styles.badgeCv}>{a.type === "bf" ? "B&F" : "Coaches"}</span></td>
                <td className={styles.td}>{a.grade}</td>
                <td className={styles.td}>{a.round}</td>
                <td className={styles.td}>{a.team}</td>
                <td className={styles.td}><strong>{a.count}</strong></td>
                <td className={styles.td}>{a.firstDate?.slice(0, 10)}</td>
                <td className={styles.td}>{a.lastDate?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
