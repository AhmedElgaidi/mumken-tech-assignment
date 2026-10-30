/** One keyword rule of the mock classifier. */
export interface KeywordRuleInterface {
  /** Category the keywords vote for. */
  categoryCode: string;
  /** Words that vote for the category: whole words when Latin, substrings when Arabic. */
  keywords: readonly string[];
}
