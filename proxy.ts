import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const SUPERADMIN_ONLY = ["/admin/fixtures", "/admin/sync", "/admin/access-codes"];

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const session = req.auth;
  const { pathname } = req.nextUrl;

  // Already logged in — redirect away from the login page
  if (session && pathname === "/admin/login") {
    return NextResponse.redirect(new URL("/admin/leaderboard", req.url));
  }

  // Not logged in — redirect to login (except login page itself)
  if (!session && pathname !== "/admin/login") {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  if (
    session &&
    SUPERADMIN_ONLY.some((p) => pathname.startsWith(p)) &&
    session.user.role !== "superadmin"
  ) {
    return NextResponse.redirect(new URL("/admin/leaderboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
