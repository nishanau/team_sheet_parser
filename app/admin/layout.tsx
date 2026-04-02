import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import { SessionProvider } from "next-auth/react";
import styles from "./layout.module.css";

const NAV = [
  { href: "/admin/leaderboard",  label: "Leaderboard",  superadminOnly: false },
  { href: "/admin/access-codes", label: "Access Codes", superadminOnly: false },
  { href: "/admin/alerts",       label: "Alerts",       superadminOnly: false },
  { href: "/admin/fixtures",     label: "Fixtures",     superadminOnly: true  },
  { href: "/admin/sync",         label: "Sync",         superadminOnly: true  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/admin/login");
  const isSuperadmin = session.user.role === "superadmin";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>SFL Admin</div>
        <nav className={styles.nav}>
          {NAV.filter((n) => !n.superadminOnly || isSuperadmin).map((n) => (
            <Link key={n.href} href={n.href} className={styles.navLink}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className={styles.footer}>
          <span className={styles.username}>{session.user.name}</span>
          <span className={styles.role}>{session.user.role}</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/admin/login" }); }}>
            <button type="submit" className={styles.signOut}>Sign out</button>
          </form>
        </div>
      </aside>
      <SessionProvider>
        <main className={styles.main}>{children}</main>
      </SessionProvider>
    </div>
  );
}
