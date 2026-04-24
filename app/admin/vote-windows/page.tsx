"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import Select from "@/app/components/Select";
import { COMPETITIONS, GRADE_MAP, ROUND_OPTIONS } from "@/lib/constants";
import styles from "./vote-windows.module.css";

type OverrideRow = {
  id: number;
  competition: string;
  grade: string;
  round: string;
  fixtureId: string | null;
  fixtureLabel: string | null;
  extendedUntil: string;
  createdBy: number;
  createdAt: string;
};

type FixtureOption = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  matchDate: string;
};

function competitionForGrade(grade: string): string {
  return grade.includes("STJFL") ? "STJFL" : "SFL";
}

function gradesForCompetition(competition: string): string[] {
  return Object.entries(GRADE_MAP)
    .filter(([key]) => key.startsWith(`${competition}::`))
    .flatMap(([, grades]) => grades);
}

export default function VoteWindowsPage() {
  const { data: session } = useSession();
  const isSuperadmin = session?.user?.role === "superadmin";
  const currentUserId = session?.user?.id ? Number(session.user.id) : NaN;
  const scopedGrades = session?.user?.scopedGrades ?? [];

  const [competition, setCompetition] = useState("SFL");
  const [grade, setGrade] = useState("");
  const [round, setRound] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [extendedUntil, setExtendedUntil] = useState("");

  const [fixtures, setFixtures] = useState<FixtureOption[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const gradeOptions = isSuperadmin ? gradesForCompetition(competition) : scopedGrades;

  const loadOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/vote-window-overrides");
      const data = await res.json();
      setOverrides(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  useEffect(() => {
    if (!grade || !round) {
      setFixtures([]);
      return;
    }

    let cancelled = false;

    fetch(`/api/fixtures?grade=${encodeURIComponent(grade)}&round=${encodeURIComponent(round)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setFixtures(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setFixtures([]);
      });

    return () => {
      cancelled = true;
    };
  }, [grade, round]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!grade) {
      setFormError("Select a grade.");
      return;
    }
    if (!round) {
      setFormError("Select a round.");
      return;
    }
    if (!extendedUntil) {
      setFormError("Set an extended-until date.");
      return;
    }
    if (!isSuperadmin && !fixtureId) {
      setFormError("club_admin must select a specific fixture.");
      return;
    }

    setSubmitting(true);
    try {
      const selectedCompetition = isSuperadmin ? competition : competitionForGrade(grade);
      const res = await fetch("/api/admin/vote-window-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competition: selectedCompetition,
          grade,
          round,
          fixtureId: fixtureId || null,
          extendedUntil,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Failed to save.");
        return;
      }

      setGrade("");
      setRound("");
      setFixtureId("");
      setExtendedUntil("");
      setFixtures([]);
      await loadOverrides();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this override?")) return;

    const res = await fetch(`/api/admin/vote-window-overrides?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadOverrides();
    }
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Vote Window Overrides</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formTitle}>Add / Update Override</div>
        <form onSubmit={handleSubmit}>
          <div className={styles.fieldRow}>
            {isSuperadmin && (
              <div className={styles.field}>
                <label className={styles.label}>Competition</label>
                <Select
                  className={styles.select}
                  value={competition}
                  onChange={(value) => {
                    setCompetition(value);
                    setGrade("");
                    setRound("");
                    setFixtureId("");
                    setFixtures([]);
                  }}
                  options={COMPETITIONS}
                />
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Grade</label>
              <Select
                className={styles.select}
                value={grade}
                onChange={(value) => {
                  setGrade(value);
                  if (!isSuperadmin && value) setCompetition(competitionForGrade(value));
                  setRound("");
                  setFixtureId("");
                  setFixtures([]);
                }}
                options={gradeOptions}
                placeholder="Select grade"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Round</label>
              <Select
                className={styles.select}
                value={round}
                onChange={(value) => {
                  setRound(value);
                  setFixtureId("");
                }}
                options={ROUND_OPTIONS}
                placeholder="Select round"
                disabled={!grade}
              />
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>
                Fixture {isSuperadmin ? "(optional - leave blank for whole round)" : ""}
              </label>
              <Select
                className={styles.select}
                value={fixtureId}
                onChange={setFixtureId}
                options={fixtures.map((fixture) => ({
                  label: `${fixture.homeTeamName} vs ${fixture.awayTeamName} (${fixture.matchDate})`,
                  value: fixture.id,
                }))}
                placeholder={isSuperadmin ? "All matches in this round" : "Select a fixture"}
                disabled={!round}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Extended Until</label>
              <input
                type="date"
                className={styles.input}
                value={extendedUntil}
                onChange={(e) => setExtendedUntil(e.target.value)}
                required
              />
            </div>
          </div>

          {formError && <p className={styles.error}>{formError}</p>}

          <div className={styles.formFooter}>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={submitting}>
              {submitting ? "Saving..." : "Save Override"}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Active Overrides</div>
        {loading ? (
          <p className={styles.hint}>Loading...</p>
        ) : overrides.length === 0 ? (
          <p className={styles.hint}>No overrides set.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Grade</th>
                <th className={styles.th}>Round</th>
                <th className={styles.th}>Scope</th>
                <th className={styles.th}>Extended Until</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((row) => {
                const canDelete = isSuperadmin || row.createdBy === currentUserId;
                return (
                  <tr key={row.id}>
                    <td className={styles.td}>{row.grade}</td>
                    <td className={styles.td}>{row.round}</td>
                    <td className={styles.td}>
                      <span className={styles.badge}>
                        {row.fixtureLabel ?? "Entire round"}
                      </span>
                    </td>
                    <td className={styles.td}>{row.extendedUntil}</td>
                    <td className={styles.td}>
                      {canDelete ? (
                        <button className={styles.deleteBtn} onClick={() => void handleDelete(row.id)}>
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
