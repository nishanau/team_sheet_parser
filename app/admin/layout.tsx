import { auth } from "@/auth";
import { signOut } from "@/auth";
import { SessionProvider } from "next-auth/react";
import AdminNav from "./AdminNav";
import Nav from "../components/Nav";
import styles from "./layout.module.css";

const NAV = [
  { href: "/admin/leaderboard",  label: "Leaderboard",  superadminOnly: false },
  { href: "/admin/access-codes", label: "Access Codes", superadminOnly: true  },
  { href: "/admin/fixtures",     label: "Fixtures",     superadminOnly: true  },
  { href: "/admin/users",        label: "Users",        superadminOnly: true  },
  { href: "/admin/sync",         label: "Sync",         superadminOnly: true  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // No session: render children only (login page). Middleware handles redirect
  // for all other /admin/** routes.
  if (!session) return <SessionProvider><Nav />{children}</SessionProvider>;

  const isSuperadmin = session.user.role === "superadmin";
  const navItems = NAV.filter((n) => !n.superadminOnly || isSuperadmin);
  const brandLabel = isSuperadmin ? "SFL Admin" : `${session.user.clubName ?? "Club"} Admin`;

  return (
    <>
    <Nav />
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>{brandLabel}</div>
        <AdminNav items={navItems} />
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
    </>
  );
}
