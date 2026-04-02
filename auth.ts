import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { adminUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
});
