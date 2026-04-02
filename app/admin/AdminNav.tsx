"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./layout.module.css";

type NavItem = { href: string; label: string };

export default function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`${styles.navLink} ${pathname.startsWith(n.href) ? styles.navLinkActive : ""}`}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
