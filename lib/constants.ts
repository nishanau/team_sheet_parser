// ─── Single source of truth for league/age-group/grade/team structure ────────
// This file is imported by API routes and the page component.
// Edit here when leagues, age groups, or grades change.

// ─── Round options ─────────────────────────────────────────────────────────
export const ROUND_OPTIONS = [
  ...Array.from({ length: 22 }, (_, i) => `Round ${i + 1}`),
  "Finals Week 1",
  "Finals Week 2",
  "Finals Week 3",
  "Grand Final",
];

// ─── Age groups per competition ────────────────────────────────────────────
export const AGE_GROUPS: Record<string, string[]> = {
  SFL:   ["Senior Men", "Reserves Men", "U18 Men", "Senior Women"],
  STJFL: ["U13 Boys", "U14 Girls", "U14 Boys", "U15 Boys", "U16 Girls"],
};

// ─── Grade names (from PlayHQ) per competition + age group ────────────────
// Key: `${competition}::${ageGroup}`
// Value: array of grade display names exactly as they appear in PlayHQ / DB
export const GRADE_MAP: Record<string, string[]> = {
  // SFL
  "SFL::Senior Men":   ["SFL Premier League Senior Men",   "SFL Community League Senior Men"],
  "SFL::Reserves Men": ["SFL Premier League Reserves Men", "SFL Community League Reserves Men"],
  "SFL::U18 Men":      ["SFL Premier League U18 Boys",     "SFL Community League U18 Boys"],
  "SFL::Senior Women": ["SFL Premier League Senior Women", "SFL Community League Senior Women"],

  // STJFL — no grade sub-division used in the form
  "STJFL::U13 Boys":  [],
  "STJFL::U14 Girls": [],
  "STJFL::U14 Boys":  [],
  "STJFL::U15 Boys":  [],
  "STJFL::U16 Girls": [],
};

// ─── STJFL teams (hardcoded until season is active on PlayHQ) ─────────────
export const STJFL_TEAMS = [
  "Central Hawks JFC",
  "Brighton JFC",
  "Channel JFC",
  "Claremont JFC",
  "Clarence FC",
  "Glenorchy District JFC",
  "Hobart JFC",
  "Huonville Lions JFC",
  "Kingborough Tigers JFC",
  "Lauderdale FC",
  "Lindisfarne JFC",
  "New Norfolk JFC",
  "North Hobart JFC",
  "Sandy Bay Lions JFC",
  "South East JFC",
  "Southern Storm Youth FC",
  "Triabunna Roos JFC",
];

// ─── Helper: all valid grades across all competitions ─────────────────────
export const ALL_GRADE_NAMES = new Set(Object.values(GRADE_MAP).flat());

// ─── Helper: lookup ageGroup from a grade name ────────────────────────────
export function ageGroupForGrade(competition: string, gradeName: string): string | null {
  for (const ageGroup of AGE_GROUPS[competition] ?? []) {
    if ((GRADE_MAP[`${competition}::${ageGroup}`] ?? []).includes(gradeName)) {
      return ageGroup;
    }
  }
  return null;
}

// ─── Allowed SFL grades (used by sync and admin fixtures filter) ───────────
export const ALLOWED_GRADES = new Set([
  "SFL Premier League Senior Men",
  "SFL Community League Senior Men",
  "SFL Premier League Reserves Men",
  "SFL Community League Reserves Men",
  "SFL Premier League U18 Boys",
  "SFL Community League U18 Boys",
  "SFL Premier League Senior Women",
  "SFL Community League Senior Women",
]);
