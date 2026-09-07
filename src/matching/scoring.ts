import { extractKeywords, normalizeText } from "./normalization";
import type {
  CoverageDetail,
  KeywordDefinition,
  KeywordMatch,
  KeywordRequirement,
  LocalMatchResult,
} from "./types";

interface LocatedText {
  start: number;
  end: number;
}

interface SearchDocument {
  normalized: string;
  sourceIndexes: number[];
}

const WEAK_CONTEXT = /(?:正在学习|学习中|初学|入门|尚无|暂无|了解过|接触过|learning|beginner|basic\s+(?:knowledge|understanding)|exposure\s+to|no\s+(?:production|professional))/iu;
const EXPERIENCE_EVIDENCE = /(?:(?:19|20)\d{2}|至今|目前|年经验|years?\s+(?:of\s+)?experience)/iu;
const DISCLAIMER = "匹配结果仅代表简历与 JD 中可核验的文本证据，不代表用户真实具备相关能力。";

function buildSearchDocument(source: string): SearchDocument {
  let normalized = "";
  const sourceIndexes: number[] = [];
  let lastWasSpace = true;

  for (let index = 0; index < source.length; ) {
    const codePoint = source.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    const width = character.length;
    const folded = character.normalize("NFKC").toLocaleLowerCase("en-US");
    for (const foldedCharacter of folded) {
      if (/^[\p{L}\p{N}+#]$/u.test(foldedCharacter)) {
        normalized += foldedCharacter;
        sourceIndexes.push(index);
        lastWasSpace = false;
      } else if (!lastWasSpace) {
        normalized += " ";
        sourceIndexes.push(index);
        lastWasSpace = true;
      }
    }
    index += width;
  }
  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    sourceIndexes.pop();
  }
  return { normalized, sourceIndexes };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchPattern(term: string): RegExp | undefined {
  const normalized = normalizeText(term);
  if (!normalized) return undefined;
  const source = normalized.split(" ").map(escapeRegExp).join("\\s*");
  const startsWithLatin = /^[a-z0-9]/u.test(normalized);
  const endsWithLatin = /[a-z0-9]$/u.test(normalized);
  return new RegExp(
    `${startsWithLatin ? "(?<![a-z0-9])" : ""}${source}${endsWithLatin ? "(?![a-z0-9])" : ""}`,
    "iu",
  );
}

function locate(document: SearchDocument, term: string): LocatedText | undefined {
  const pattern = searchPattern(term);
  const match = pattern?.exec(document.normalized);
  if (!match?.[0]) return undefined;
  const normalizedEnd = match.index + match[0].length - 1;
  const start = document.sourceIndexes[match.index];
  const finalSourceIndex = document.sourceIndexes[normalizedEnd];
  if (start === undefined || finalSourceIndex === undefined) return undefined;
  return { start, end: finalSourceIndex + 1 };
}

function excerptAt(source: string, location: LocatedText): string {
  const boundary = /[\n。！？!?；;]/u;
  let start = location.start;
  let end = location.end;
  while (start > 0 && !boundary.test(source[start - 1] ?? "")) start -= 1;
  while (end < source.length && !boundary.test(source[end] ?? "")) end += 1;
  const full = source.slice(start, end).trim();
  if (full.length <= 180) return full;
  const localStart = Math.max(0, location.start - start - 70);
  return full.slice(localStart, localStart + 180).trim();
}

function locateExact(document: SearchDocument, keyword: KeywordDefinition): LocatedText | undefined {
  return locate(document, keyword.original);
}

function locateAlias(document: SearchDocument, keyword: KeywordDefinition): LocatedText | undefined {
  const originalKey = normalizeText(keyword.original).replace(/\s+/g, "");
  for (const alias of keyword.aliases) {
    if (normalizeText(alias).replace(/\s+/g, "") === originalKey) continue;
    const location = locate(document, alias);
    if (location) return location;
  }
  return undefined;
}

function meaningfulResponsibilityTerms(original: string): string[] {
  const withoutVerb = original.replace(
    /^(?:负责|承担|主导|设计|开发|维护|管理|lead(?:ing)?|design(?:ing)?|develop(?:ing)?|build(?:ing)?|maintain(?:ing)?|manage(?:ment|ing)?)\s*/iu,
    "",
  );
  return withoutVerb
    .split(/(?:与|和|及|、|\/|\band\b)/iu)
    .map((term) => term.trim())
    .filter((term) => normalizeText(term).length >= 2);
}

function findReviewEvidence(
  resumeText: string,
  document: SearchDocument,
  keyword: KeywordDefinition,
): LocatedText | undefined {
  if (keyword.category === "experience") {
    const match = EXPERIENCE_EVIDENCE.exec(resumeText);
    if (!match?.[0] || match.index === undefined) return undefined;
    return { start: match.index, end: match.index + match[0].length };
  }
  if (keyword.category === "responsibility") {
    for (const term of meaningfulResponsibilityTerms(keyword.original)) {
      const location = locate(document, term);
      if (location) return location;
    }
  }
  return undefined;
}

function matchKeyword(
  resumeText: string,
  document: SearchDocument,
  keyword: KeywordDefinition,
): KeywordMatch {
  const exact = locateExact(document, keyword);
  if (exact) {
    const evidence = excerptAt(resumeText, exact);
    const weak = WEAK_CONTEXT.test(evidence);
    return {
      ...keyword,
      status: weak ? "weak-context" : "exact",
      evidence,
      uncertain: weak,
    };
  }

  const synonym = locateAlias(document, keyword);
  if (synonym) {
    const evidence = excerptAt(resumeText, synonym);
    const weak = WEAK_CONTEXT.test(evidence);
    return {
      ...keyword,
      status: weak ? "weak-context" : "synonym",
      evidence,
      uncertain: weak,
    };
  }

  const reviewEvidence = findReviewEvidence(resumeText, document, keyword);
  if (reviewEvidence) {
    return {
      ...keyword,
      status: "needs-review",
      evidence: excerptAt(resumeText, reviewEvidence),
      uncertain: true,
    };
  }

  return { ...keyword, status: "missing", uncertain: false };
}

function weight(item: KeywordMatch): number {
  if (item.status === "exact" || item.status === "synonym") return 1;
  if (item.status === "weak-context") return 0.5;
  return 0;
}

function coverageDetail(items: readonly KeywordMatch[]): CoverageDetail {
  const earned = items.reduce((sum, item) => sum + weight(item), 0);
  const total = items.length;
  const percentage = total === 0 ? 0 : Math.round((earned / total) * 10_000) / 100;
  return { earned, total, percentage };
}

function byRequirement(
  items: readonly KeywordMatch[],
  requirement: KeywordRequirement,
): KeywordMatch[] {
  return items.filter((item) => item.requirement === requirement);
}

export function scoreKeywords(
  resumeText: string,
  keywords: readonly KeywordDefinition[],
): LocalMatchResult {
  const document = buildSearchDocument(resumeText);
  const items = keywords.map((keyword) => matchKeyword(resumeText, document, keyword));
  const matched = items.filter(
    (item) => item.status === "exact" || item.status === "synonym",
  );
  const weakMatches = items.filter((item) => item.status === "weak-context");
  const missing = items.filter((item) => item.status === "missing");
  const needsReview = items.filter((item) => item.status === "needs-review");
  const overall = coverageDetail(items);
  const required = coverageDetail(byRequirement(items, "required"));
  const preferred = coverageDetail(byRequirement(items, "preferred"));
  const evidence = items.flatMap((item) =>
    item.evidence ? [{ keyword: item.original, excerpt: item.evidence }] : [],
  );

  return {
    coverage: {
      overall: overall.percentage,
      required: required.percentage,
      preferred: preferred.percentage,
    },
    coverageDetails: { overall, required, preferred },
    items,
    matched,
    weakMatches,
    missing,
    needsReview,
    matchedKeywords: matched.map((item) => item.original),
    missingKeywords: missing.map((item) => item.original),
    uncertainItems: [...weakMatches, ...needsReview].map((item) => item.original),
    evidence,
    recommendations: [],
    disclaimer: DISCLAIMER,
  };
}

export function runLocalMatch(jdText: string, resumeText: string): LocalMatchResult {
  return scoreKeywords(resumeText, extractKeywords(jdText));
}

export const matchJobDescription = runLocalMatch;
