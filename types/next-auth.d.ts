import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: string;
      clubId: number | null;
      leagueId: number | null;
      hasCoachesTab: boolean;
      clubName: string | null;
      scopedGrades: string[] | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role: string;
    clubId: number | null;
    leagueId: number | null;
    hasCoachesTab: boolean;
    clubName: string | null;
    scopedGrades: string[] | null;
  }
}
