import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { adminUsers, teams, clubs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { CV_GRADES } from "@/lib/constants";

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

        // Determine coaches-tab eligibility and club name at login time
        let hasCoachesTab = user.role === "superadmin";
        let clubName: string | null = null;
        let scopedGrades: string[] | null = null;
        if (user.clubId) {
          const [clubRow, clubTeams] = await Promise.all([
            db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, user.clubId)).limit(1),
            db.select({ gradeName: teams.gradeName }).from(teams).where(eq(teams.clubId, user.clubId)),
          ]);
          clubName = clubRow[0]?.name ?? null;
          scopedGrades = [...new Set(clubTeams.map((t) => t.gradeName).filter((g): g is string => !!g))];
          if (!hasCoachesTab) {
            hasCoachesTab = scopedGrades.some((g) => CV_GRADES.has(g));
          }
        }

        return {
          id:            String(user.id),
          name:          user.username,
          role:          user.role,
          clubId:        user.clubId ?? null,
          leagueId:      user.leagueId ?? null,
          hasCoachesTab,
          clubName,
          scopedGrades,
        };
      },
    }),
  ],
});
