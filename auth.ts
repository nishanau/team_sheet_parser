import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { adminUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

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
        const username = credentials.username as string;
        const [user] = await db
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.username, username))
          .limit(1);
        if (!user) {
          logger.warn("[auth] login failed", { category: "auth", username, reason: "user not found" });
          return null;
        }
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) {
          logger.warn("[auth] login failed", { category: "auth", username, reason: "invalid password" });
          return null;
        }
        logger.info("[auth] login success", { category: "auth", username, role: user.role });
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
