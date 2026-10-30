import { KeywordRuleInterface } from "../../contracts/interfaces/worker/keyword-rule.interface";

/** Keyword rules of the mock classifier (English plus a few Arabic words). Order = priority on ties. */
export const KEYWORD_RULES: ReadonlyArray<KeywordRuleInterface> = [
  {
    categoryCode: "economy",
    keywords: [
      "economy",
      "market",
      "inflation",
      "bank",
      "budget",
      "trade",
      "investment",
      "price",
      "اقتصاد",
      "سوق",
      "استثمار",
    ],
  },
  {
    categoryCode: "health",
    keywords: ["health", "hospital", "vaccine", "disease", "medical", "food safety", "clinic", "صحة", "مستشفى"],
  },
  {
    categoryCode: "education",
    keywords: ["school", "university", "education", "student", "teacher", "exam", "تعليم", "جامعة", "مدرسة"],
  },
  {
    categoryCode: "technology",
    keywords: ["technology", "software", "digital", "ai", "internet", "app", "cyber", "تقنية", "رقمي"],
  },
  {
    categoryCode: "legal",
    keywords: [
      "law",
      "regulation",
      "court",
      "decree",
      "license",
      "licence",
      "unlicensed",
      "compliance",
      "inspection",
      "نظام",
      "لائحة",
      "محكمة",
    ],
  },
  {
    categoryCode: "sports",
    keywords: ["football", "match", "league", "olympic", "tournament", "sport", "رياضة", "مباراة"],
  },
  {
    categoryCode: "culture",
    keywords: ["festival", "museum", "art", "music", "heritage", "film", "book", "ثقافة", "مهرجان"],
  },
];
