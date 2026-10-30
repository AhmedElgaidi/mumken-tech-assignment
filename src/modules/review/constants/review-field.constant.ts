/** Maximum length per field a reviewer submits. */
export const REVIEW_FIELD_LIMITS = {
  reviewedBy: 100,
  reason: 500,
  categoryCode: 50,
} as const;
