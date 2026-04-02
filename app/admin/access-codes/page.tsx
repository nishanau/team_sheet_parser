"use client";
import { useState, useEffect } from "react";
import styles from "./access-codes.module.css";

type CodeRow = { id: number; teamName: string; gradeName: string; code: string; active: boolean };

export default function AccessCodesPage() {
  const [rows,    setRows]    = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/access-codes")
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  async function regenerate(id: number) {
    const res  = await fetch("/api/admin/access-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "regenerate" }) });
    const data = await res.json() as { code: string };
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, code: data.code } : r));
  }

  async function toggle(id: number) {
    const res  = await fetch("/api/admin/access-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "toggle" }) });
    const data = await res.json() as { active: boolean };
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, active: data.active } : r));
  }

  function copy(id: number, code: string) {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1 className={styles.title}>Access Codes</h1>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Team</th>
            <th className={styles.th}>Grade</th>
            <th className={styles.th}>Code</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`${styles.tr} ${!r.active ? styles.inactive : ""}`}>
              <td className={styles.td}>{r.teamName}</td>
              <td className={styles.td}>{r.gradeName}</td>
              <td className={styles.td}><code className={styles.code}>{r.code}</code></td>
              <td className={styles.td}><span className={r.active ? styles.badgeActive : styles.badgeInactive}>{r.active ? "Active" : "Inactive"}</span></td>
              <td className={styles.td}>
                <div className={styles.actions}>
                  <button className={styles.btn} onClick={() => copy(r.id, r.code)}>{copied === r.id ? "Copied!" : "Copy"}</button>
                  <button className={styles.btn} onClick={() => regenerate(r.id)}>Regenerate</button>
                  <button className={`${styles.btn} ${r.active ? styles.btnDanger : ""}`} onClick={() => toggle(r.id)}>{r.active ? "Deactivate" : "Activate"}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
