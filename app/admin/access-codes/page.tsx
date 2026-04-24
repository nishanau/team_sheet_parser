"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import Select from "@/app/components/Select";
import styles from "./access-codes.module.css";

type CodeRow = { id: number; teamName: string; gradeName: string; code: string; active: boolean };

export default function AccessCodesPage() {
  const { data: session } = useSession();
  const isClubAdmin = session?.user?.role === "club_admin";

  const [rows, setRows] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/admin/access-codes")
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  async function regenerate(id: number) {
    const res = await fetch("/api/admin/access-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "regenerate" }),
    });
    const data = await res.json() as { code: string };
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, code: data.code } : r)));
    setRevealed((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  }

  async function toggle(id: number) {
    const res = await fetch("/api/admin/access-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "toggle" }),
    });
    const data = await res.json() as { active: boolean };
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, active: data.active } : r)));
  }

  function copy(id: number, code: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => fallbackCopy(code));
    } else {
      fallbackCopy(code);
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  function toggleReveal(id: number) {
    setRevealed((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  const grades = useMemo(() => [...new Set(rows.map((r) => r.gradeName))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesGrade = !grade || r.gradeName === grade;
      const matchesSearch = !q || r.teamName.toLowerCase().includes(q);
      return matchesGrade && matchesSearch;
    });
  }, [rows, search, grade]);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1 className={styles.title}>Access Codes</h1>

      {!isClubAdmin && (
        <div className={styles.filters}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className={styles.gradeSelect}
            value={grade}
            onChange={setGrade}
            options={grades}
            placeholder="All Grades"
          />
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Team</th>
            {!isClubAdmin && <th className={styles.th}>Grade</th>}
            <th className={styles.th}>Code</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td className={styles.td} colSpan={isClubAdmin ? 4 : 5} style={{ color: "#94a3b8" }}>
                No results.
              </td>
            </tr>
          )}
          {filtered.map((r) => {
            const isRevealed = revealed.has(r.id);
            return (
              <tr key={r.id} className={`${styles.tr} ${!r.active ? styles.inactive : ""}`}>
                <td className={styles.td}>{r.teamName}</td>
                {!isClubAdmin && <td className={styles.td}>{r.gradeName}</td>}
                <td className={styles.td}>
                  <code className={styles.code}>
                    {isClubAdmin && !isRevealed ? "••••-••••" : r.code}
                  </code>
                </td>
                <td className={styles.td}>
                  <span className={r.active ? styles.badgeActive : styles.badgeInactive}>
                    {r.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className={styles.td}>
                  <div className={styles.actions}>
                    {isClubAdmin ? (
                      <button className={styles.btn} onClick={() => toggleReveal(r.id)}>
                        {isRevealed ? "Hide" : "Show Code"}
                      </button>
                    ) : (
                      <button className={styles.btn} onClick={() => copy(r.id, r.code)}>
                        {copied === r.id ? "Copied!" : "Copy"}
                      </button>
                    )}
                    <button className={styles.btn} onClick={() => regenerate(r.id)}>Regenerate</button>
                    <button
                      className={`${styles.btn} ${r.active ? styles.btnDanger : ""}`}
                      onClick={() => toggle(r.id)}
                    >
                      {r.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
