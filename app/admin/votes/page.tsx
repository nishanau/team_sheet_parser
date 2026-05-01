"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import type { BestAndFairestSelect, CoachesVoteSelect } from "@/db/schema";
import Select from "@/app/components/Select";
import { COMPETITIONS, GRADE_MAP, ROUND_OPTIONS } from "@/lib/constants";
import styles from "./votes.module.css";

const VOTE_WEIGHTS = [5, 4, 3, 2, 1] as const;

type BfSubmission = BestAndFairestSelect & { homeTeam?: string | null };
type ApiResponse = { bf: BfSubmission[]; coaches: CoachesVoteSelect[] };

function allGradesFor(competition: string) {
  return Object.entries(GRADE_MAP)
    .filter(([key]) => key.startsWith(competition))
    .flatMap(([, grades]) => grades)
    .filter((g) => g.length > 0);
}

function groupByRound<T extends { round: string }>(items: T[]): { round: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!map.has(item.round)) map.set(item.round, []);
    map.get(item.round)?.push(item);
  }
  return ROUND_OPTIONS.filter((r) => map.has(r)).map((r) => ({ round: r, items: map.get(r)! }));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function getPlayers(sub: BestAndFairestSelect | CoachesVoteSelect) {
  return [
    { num: sub.player1Number, name: sub.player1Name },
    { num: sub.player2Number, name: sub.player2Name },
    { num: sub.player3Number, name: sub.player3Name },
    { num: sub.player4Number, name: sub.player4Name },
    { num: sub.player5Number, name: sub.player5Name },
  ].filter((p): p is { num: string | null; name: string } => p.name !== null && p.name !== "");
}

function PlayerList({ sub }: { sub: BestAndFairestSelect | CoachesVoteSelect }) {
  const players = getPlayers(sub);
  return (
    <ul className={styles.players}>
      {players.map((p, i) => (
        <li key={p.name} className={styles.playerRow}>
          <span className={styles.voteWeight}>{VOTE_WEIGHTS[i]} votes</span>
          <span className={styles.playerNum}>#{p.num ?? "-"}</span>
          <span>{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

function BfCard({ sub }: { sub: BfSubmission }) {
  const submittingTeam = sub.submittingTeam ?? sub.homeTeam ?? "";

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.matchup}>{submittingTeam} vs {sub.opposition}</span>
        <span className={styles.meta}>{formatDate(sub.matchDate)}</span>
      </div>
      <span className={styles.badge}>{sub.competition} · {sub.ageGroup}</span>
      <PlayerList sub={sub} />
      <div className={styles.cardFooter}>
        <span>Submitted by: {sub.submitterName}</span>
        <span>{new Date(sub.createdAt).toLocaleString("en-AU")}</span>
      </div>
    </div>
  );
}

function CoachCard({ sub }: { sub: CoachesVoteSelect }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.matchup}>{sub.homeTeam} vs {sub.awayTeam}</span>
        <span className={styles.meta}>{formatDate(sub.matchDate)}</span>
      </div>
      <span className={styles.badge}>Coach: {sub.coachTeam}</span>
      <PlayerList sub={sub} />
      <div className={styles.cardFooter}>
        <span>Submitted by: {sub.submitterName}</span>
        <span>{new Date(sub.createdAt).toLocaleString("en-AU")}</span>
      </div>
    </div>
  );
}

function readInitialParam(urlKey: string, storageKey: string, fallback = "") {
  const urlVal = new URLSearchParams(window.location.search).get(urlKey);
  if (urlVal !== null) return urlVal;
  return sessionStorage.getItem(storageKey) ?? fallback;
}

export default function VotesPage() {
  useSession();

  const [competition, setCompetition] = useState("SFL");
  const [grade, setGrade] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const grades = allGradesFor(competition);

  useEffect(() => {
    setCompetition(readInitialParam("competition", "votes:competition", "SFL"));
    setGrade(readInitialParam("grade", "votes:grade"));
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;

    sessionStorage.setItem("votes:competition", competition);
    sessionStorage.setItem("votes:grade", grade);

    const params = new URLSearchParams();
    if (competition !== "SFL") params.set("competition", competition);
    if (grade) params.set("grade", grade);

    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filtersReady, competition, grade]);

  function handleCompetitionChange(val: string) {
    setCompetition(val);
    setGrade("");
    setData(null);
  }

  useEffect(() => {
    if (grade && !grades.includes(grade)) {
      setGrade("");
      setData(null);
    }
  }, [grade, grades]);

  useEffect(() => {
    if (!filtersReady || !grade) {
      setData(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res: ApiResponse = await fetch(`/api/admin/votes?grade=${encodeURIComponent(grade)}`).then((r) => r.json());
        if (!cancelled) setData(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filtersReady, grade]);

  const bfGroups = data ? groupByRound(data.bf) : [];
  const cvGroups = data ? groupByRound(data.coaches) : [];

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Vote Submissions</h1>
      </div>

      <div className={styles.filters}>
        <Select value={competition} onChange={handleCompetitionChange} options={COMPETITIONS} />
        <Select
          value={grade}
          onChange={setGrade}
          options={grades}
          placeholder="Select Grade"
          className={styles.gradeSelect}
          triggerClassName={styles.gradeTrigger}
        />
      </div>

      {loading ? (
        <p className={styles.hint}>Loading...</p>
      ) : !grade ? (
        <p className={styles.hint}>Select a grade to view submissions.</p>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Best &amp; Fairest Submissions</h2>
            {bfGroups.length === 0 ? (
              <p className={styles.hint}>No submissions for this grade.</p>
            ) : bfGroups.map(({ round, items }) => (
              <div key={round} className={styles.roundGroup}>
                <h3 className={styles.roundHeading}>{round}</h3>
                <div className={styles.cards}>
                  {items.map((sub) => <BfCard key={sub.id} sub={sub} />)}
                </div>
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Coaches Votes Submissions</h2>
            {cvGroups.length === 0 ? (
              <p className={styles.hint}>No submissions for this grade.</p>
            ) : cvGroups.map(({ round, items }) => (
              <div key={round} className={styles.roundGroup}>
                <h3 className={styles.roundHeading}>{round}</h3>
                <div className={styles.cards}>
                  {items.map((sub) => <CoachCard key={sub.id} sub={sub} />)}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
