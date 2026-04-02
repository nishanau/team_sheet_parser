import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { adminUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const [user] = await db
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.username, credentials.username as string))
          .limit(1);
        if (!user) return null;
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;
        return {
          id:       String(user.id),
          name:     user.username,
          role:     user.role,
          clubId:   user.clubId ?? null,
          leagueId: user.leagueId ?? null,
        };
      },
    }),
  ],
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
  pages: { signIn: "/admin/login" },
});
