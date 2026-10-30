/** The fixed category list every classification uses; seeded at startup, never edited by the API. */
export const CATEGORIES: readonly { readonly code: string; readonly name: string }[] = Object.freeze([
  { code: "economy", name: "Economy" },
  { code: "health", name: "Health" },
  { code: "education", name: "Education" },
  { code: "technology", name: "Technology" },
  { code: "legal", name: "Legal & Regulation" },
  { code: "sports", name: "Sports" },
  { code: "culture", name: "Culture" },
  { code: "other", name: "Other" },
]);
