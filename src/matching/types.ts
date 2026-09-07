export const KEYWORD_CATEGORIES = [
  "skill",
  "tool",
  "framework",
  "platform",
  "general-ability",
  "education",
  "certification",
  "language",
  "experience",
  "responsibility",
] as const;

export type KeywordCategory = (typeof KEYWORD_CATEGORIES)[number];
export type KeywordRequirement = "required" | "preferred";
export type KeywordMatchStatus =
  | "exact"
  | "synonym"
  | "weak-context"
  | "missing"
  | "needs-review";

export interface KeywordDefinition {
  original: string;
  normalized: string;
  canonical: string;
  category: KeywordCategory;
  requirement: KeywordRequirement;
  aliases: readonly string[];
}

export type KeywordGroups = Record<KeywordCategory, KeywordDefinition[]>;

export interface KeywordMatch extends KeywordDefinition {
  status: KeywordMatchStatus;
  evidence?: string;
  uncertain: boolean;
}

export interface CoverageDetail {
  earned: number;
  total: number;
  percentage: number;
}

export interface MatchCoverage {
  overall: number;
  required: number;
  preferred: number;
}

export interface MatchCoverageDetails {
  overall: CoverageDetail;
  required: CoverageDetail;
  preferred: CoverageDetail;
}

export interface LocalMatchResult {
  coverage: MatchCoverage;
  coverageDetails: MatchCoverageDetails;
  items: KeywordMatch[];
  matched: KeywordMatch[];
  weakMatches: KeywordMatch[];
  missing: KeywordMatch[];
  needsReview: KeywordMatch[];
  matchedKeywords: string[];
  missingKeywords: string[];
  uncertainItems: string[];
  evidence: Array<{ keyword: string; excerpt: string }>;
  recommendations: string[];
  disclaimer: string;
}
