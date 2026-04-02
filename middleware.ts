import { auth } from "@/auth";
import { NextResponse } from "next/server";

const SUPERADMIN_ONLY = ["/admin/fixtures", "/admin/sync"];

export default auth((req) => {
  const session = req.auth;

  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const { pathname } = req.nextUrl;
  if (
    SUPERADMIN_ONLY.some((p) => pathname.startsWith(p)) &&
    session.user.role !== "superadmin"
  ) {
    return NextResponse.redirect(new URL("/admin/leaderboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/((?!login$).*)"],
};
