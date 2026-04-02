import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config — no database imports.
// Used by middleware for JWT session verification only.
// The full auth.ts extends this with the Credentials provider + DB calls.
export const authConfig = {
  pages: { signIn: "/admin/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role     = (user as { role: string }).role;
        token.clubId   = (user as { clubId: number | null }).clubId;
        token.leagueId = (user as { leagueId: number | null }).leagueId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role     = token.role as string;
      session.user.clubId   = token.clubId as number | null;
      session.user.leagueId = token.leagueId as number | null;
      return session;
    },
  },
} satisfies NextAuthConfig;
