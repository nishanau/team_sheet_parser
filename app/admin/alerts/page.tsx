"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AlertsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/leaderboard"); }, [router]);
  return null;
}
