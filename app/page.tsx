import Link from "next/link";
import styles from "./home.module.css";

export const metadata = {
  title: "SFL Tools",
  description: "Southern Football League tools — Team Sheet Parser and Best & Fairest voting.",
};

const TOOLS = [
  {
    href: "/teamsheet",
    icon: "📄",
    title: "Team Sheet Parser",
    description:
      "Upload a team sheet PDF to extract the round number, team name and player list. Download the results directly into your Excel tracker.",
    cta: "Open Parser →",
    accent: "purple",
  },
  {
    href: "/bestandfairest",
    icon: "🏆",
    title: "Best & Fairest Votes",
    description:
      "Submit Best & Fairest votes for SFL and STJFL matches. Supports all age groups with a per-day submission limit and digital signature sign-off.",
    cta: "Submit Votes →",
    accent: "green",
  },
];

export default function HomePage() {
  return (
    <main className={styles.main}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroIcon}>🏈</div>
        <h1 className={styles.heroTitle}>SFL Tools</h1>
        <p className={styles.heroSub}>
          A suite of tools for Southern Football League administrators and coaches.
        </p>
      </section>

      {/* Cards */}
      <section className={styles.grid}>
        {TOOLS.map((tool) => (
          <Link key={tool.href} href={tool.href} className={`${styles.card} ${styles[`card_${tool.accent}`]}`}>
            <div className={styles.cardIcon}>{tool.icon}</div>
            <h2 className={styles.cardTitle}>{tool.title}</h2>
            <p className={styles.cardDesc}>{tool.description}</p>
            <span className={styles.cardCta}>{tool.cta}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
