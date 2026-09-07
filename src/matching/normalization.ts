import {
  KEYWORD_CATEGORIES,
  type KeywordCategory,
  type KeywordDefinition,
  type KeywordGroups,
  type KeywordRequirement,
} from "./types";

interface CatalogEntry {
  canonical: string;
  category: KeywordCategory;
  forms: readonly string[];
}

interface KeywordOptions {
  category?: KeywordCategory;
  requirement?: KeywordRequirement;
}

interface LocatedCatalogEntry {
  entry: CatalogEntry;
  start: number;
  end: number;
  original: string;
}

const CATALOG: readonly CatalogEntry[] = [
  { canonical: "typescript", category: "skill", forms: ["TypeScript", "Type Script"] },
  { canonical: "javascript", category: "skill", forms: ["JavaScript", "Java Script", "JS"] },
  { canonical: "python", category: "skill", forms: ["Python"] },
  { canonical: "java", category: "skill", forms: ["Java"] },
  { canonical: "go", category: "skill", forms: ["Go", "Golang"] },
  { canonical: "sql", category: "skill", forms: ["SQL"] },
  { canonical: "mysql", category: "skill", forms: ["MySQL", "My SQL"] },
  { canonical: "postgresql", category: "skill", forms: ["PostgreSQL", "Postgres"] },
  { canonical: "react", category: "framework", forms: ["React", "React.js", "ReactJS"] },
  { canonical: "vue", category: "framework", forms: ["Vue", "Vue.js", "VueJS"] },
  { canonical: "angular", category: "framework", forms: ["Angular"] },
  { canonical: "spring boot", category: "framework", forms: ["Spring Boot", "SpringBoot"] },
  { canonical: "django", category: "framework", forms: ["Django"] },
  { canonical: "git", category: "tool", forms: ["Git"] },
  { canonical: "jira", category: "tool", forms: ["Jira"] },
  { canonical: "figma", category: "tool", forms: ["Figma"] },
  { canonical: "excel", category: "tool", forms: ["Excel"] },
  { canonical: "docker", category: "platform", forms: ["Docker"] },
  { canonical: "kubernetes", category: "platform", forms: ["Kubernetes", "K8s"] },
  { canonical: "aws", category: "platform", forms: ["AWS", "Amazon Web Services", "亚马逊云"] },
  { canonical: "azure", category: "platform", forms: ["Azure", "微软云"] },
  { canonical: "gcp", category: "platform", forms: ["GCP", "Google Cloud"] },
  { canonical: "linux", category: "platform", forms: ["Linux"] },
  { canonical: "人工智能", category: "skill", forms: ["人工智能", "AI", "Artificial Intelligence"] },
  { canonical: "机器学习", category: "skill", forms: ["机器学习", "Machine Learning", "ML"] },
  { canonical: "沟通能力", category: "general-ability", forms: ["沟通能力", "沟通", "Communication Skills", "Communication"] },
  { canonical: "团队协作", category: "general-ability", forms: ["团队协作", "团队合作", "Teamwork", "Collaboration"] },
  { canonical: "问题解决", category: "general-ability", forms: ["问题解决", "解决问题", "Problem Solving"] },
  { canonical: "领导力", category: "general-ability", forms: ["领导力", "Leadership"] },
  { canonical: "本科", category: "education", forms: ["本科", "学士", "Bachelor's Degree", "Bachelor Degree"] },
  { canonical: "硕士", category: "education", forms: ["硕士", "Master's Degree", "Master Degree"] },
  { canonical: "博士", category: "education", forms: ["博士", "PhD", "Doctorate"] },
  { canonical: "pmp", category: "certification", forms: ["PMP"] },
  { canonical: "cpa", category: "certification", forms: ["CPA", "注册会计师"] },
  { canonical: "英语六级", category: "language", forms: ["英语六级", "大学英语六级", "CET-6", "CET 6"] },
  { canonical: "英语四级", category: "language", forms: ["英语四级", "大学英语四级", "CET-4", "CET 4"] },
  { canonical: "英语", category: "language", forms: ["英语", "英文", "English"] },
  { canonical: "中文", category: "language", forms: ["中文", "汉语", "Chinese", "Mandarin"] },
  { canonical: "日语", category: "language", forms: ["日语", "Japanese"] },
];

const PREFERRED_MARKERS = /(?:加分项?|优先(?:考虑|条件)?|更佳|preferred|nice\s+to\s+have|bonus|a\s+plus)/iu;
const REQUIRED_MARKERS = /(?:任职要求|岗位要求|必须|必需|要求|精通|熟练|required|requirements?|must|minimum)/iu;
const EXPERIENCE_PATTERN = /(?:\d+(?:\.\d+)?\s*(?:年|years?)\s*(?:(?:以上|及以上|\+|or\s+more|min(?:imum)?\.?)\s*)?(?:[^。；;,，\n]{0,12})?(?:经验|experience))/giu;
const RESPONSIBILITY_PATTERN = /^(?:负责|承担|主导|设计|开发|维护|管理|lead(?:ing)?|design(?:ing)?|develop(?:ing)?|build(?:ing)?|maintain(?:ing)?|manage(?:ment|ing)?)(?:\s|[:：])*(.+)$/iu;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function comparisonKey(value: string): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function catalogEntryFor(value: string): CatalogEntry | undefined {
  const key = comparisonKey(value);
  return CATALOG.find((entry) =>
    entry.forms.some((form) => comparisonKey(form) === key),
  );
}

export function normalizeKeyword(
  original: string,
  options: KeywordOptions = {},
): KeywordDefinition {
  const displayForm = original.trim();
  const entry = catalogEntryFor(displayForm);
  const normalized = normalizeText(displayForm);
  return {
    original: displayForm,
    normalized,
    canonical: entry?.canonical ?? normalized,
    category: options.category ?? entry?.category ?? "skill",
    requirement: options.requirement ?? "required",
    aliases: (entry?.forms ?? [displayForm])
      .map(normalizeText)
      .filter((form, index, forms) => form && forms.indexOf(form) === index),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formPattern(form: string): RegExp {
  const normalized = normalizeText(form);
  const parts = normalized.split(" ").map(escapeRegExp);
  const source = parts.join("[\\s\\p{P}_]*");
  const latinStart = /^[a-z0-9]/iu.test(normalized);
  const latinEnd = /[a-z0-9]$/iu.test(normalized);
  return new RegExp(
    `${latinStart ? "(?<![a-z0-9])" : ""}${source}${latinEnd ? "(?![a-z0-9])" : ""}`,
    "iu",
  );
}

function locateCatalogEntries(line: string): LocatedCatalogEntry[] {
  const candidates: LocatedCatalogEntry[] = [];
  for (const entry of CATALOG) {
    for (const form of entry.forms) {
      const match = formPattern(form).exec(line.normalize("NFKC"));
      if (!match?.[0]) continue;
      candidates.push({
        entry,
        start: match.index,
        end: match.index + match[0].length,
        original: line.slice(match.index, match.index + match[0].length),
      });
    }
  }

  candidates.sort((left, right) => {
    const lengthDifference = right.end - right.start - (left.end - left.start);
    return lengthDifference || left.start - right.start;
  });
  const selected: LocatedCatalogEntry[] = [];
  for (const candidate of candidates) {
    const overlaps = selected.some(
      (item) => candidate.start < item.end && candidate.end > item.start,
    );
    if (!overlaps && !selected.some((item) => item.entry.canonical === candidate.entry.canonical)) {
      selected.push(candidate);
    }
  }
  return selected.sort((left, right) => left.start - right.start);
}

function cleanedLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/, "")
    .replace(/[。；;，,\s]+$/u, "")
    .trim();
}

function lineRequirement(line: string, section: KeywordRequirement): KeywordRequirement {
  if (PREFERRED_MARKERS.test(line)) return "preferred";
  if (REQUIRED_MARKERS.test(line)) return "required";
  return section;
}

function requirementForRange(
  line: string,
  start: number,
  end: number,
  section: KeywordRequirement,
): KeywordRequirement {
  // Requirement markers apply to the punctuation-delimited clause containing
  // the keyword, rather than leaking across a line of independent clauses.
  const delimiter = /[;；。！？!?，,]/u;
  let clauseStart = start;
  while (clauseStart > 0 && !delimiter.test(line[clauseStart - 1] ?? "")) {
    clauseStart -= 1;
  }
  let clauseEnd = end;
  while (clauseEnd < line.length && !delimiter.test(line[clauseEnd] ?? "")) {
    clauseEnd += 1;
  }
  return lineRequirement(line.slice(clauseStart, clauseEnd), section);
}

function pushUnique(target: KeywordDefinition[], keyword: KeywordDefinition): void {
  const duplicate = target.some(
    (item) => item.canonical === keyword.canonical && item.category === keyword.category,
  );
  if (!duplicate) target.push(keyword);
}

export function extractKeywords(jdText: string): KeywordDefinition[] {
  const result: KeywordDefinition[] = [];
  let section: KeywordRequirement = "required";

  for (const rawLine of jdText.split(/\r?\n/)) {
    const line = cleanedLine(rawLine);
    if (!line) continue;
    if (PREFERRED_MARKERS.test(line) && /^(?:加分项?|优先条件|preferred|nice\s+to\s+have)/iu.test(line)) {
      section = "preferred";
      if (!/[:：]\s*\S/u.test(line)) continue;
    } else if (REQUIRED_MARKERS.test(line) && /^(?:任职要求|岗位要求|requirements?)/iu.test(line)) {
      section = "required";
      if (!/[:：]\s*\S/u.test(line)) continue;
    }

    for (const located of locateCatalogEntries(line)) {
      pushUnique(
        result,
        normalizeKeyword(located.original, {
          category: located.entry.category,
          requirement: requirementForRange(line, located.start, located.end, section),
        }),
      );
    }

    for (const match of line.matchAll(EXPERIENCE_PATTERN)) {
      pushUnique(
        result,
        normalizeKeyword(match[0], {
          category: "experience",
          requirement: requirementForRange(
            line,
            match.index ?? 0,
            (match.index ?? 0) + match[0].length,
            section,
          ),
        }),
      );
    }

    const responsibility = RESPONSIBILITY_PATTERN.exec(line);
    if (responsibility) {
      const original = line.replace(/[。；;，,\s]+$/u, "");
      pushUnique(
        result,
        normalizeKeyword(original, {
          category: "responsibility",
          requirement: requirementForRange(line, 0, line.length, section),
        }),
      );
    }
  }
  return result;
}

export function groupKeywords(keywords: readonly KeywordDefinition[]): KeywordGroups {
  const groups = Object.fromEntries(
    KEYWORD_CATEGORIES.map((category) => [category, []]),
  ) as unknown as KeywordGroups;
  for (const keyword of keywords) groups[keyword.category].push({ ...keyword });
  return groups;
}

export const parseJobDescription = extractKeywords;
