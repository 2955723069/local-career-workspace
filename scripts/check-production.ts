import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface AuditViolation {
  file: string;
  rule:
    | "forbidden-path"
    | "test-source"
    | "hard-coded-api-key"
    | "hard-coded-ai-setting"
    | "read-error"
    | "missing-production-directory";
}

const FORBIDDEN_SEGMENTS = new Set([
  "tests",
  "test",
  "e2e",
  "node_modules",
  "vendor",
  "dependencies",
  "deps",
  "__tests__",
  "test-results",
]);

const TEST_SOURCE_PATTERN = /(?:^|[._-])(test|spec)\.[cm]?[jt]sx?(?:\.map)?$/i;
const OPENAI_KEY_PATTERN = /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b/;
const GENERIC_KEY_PATTERN = /["']?api[_-]?(?:key|token|secret)["']?\s*[:=]\s*["']([^"']{12,})["']/i;
const AI_SETTING_PATTERN = /["']?(?:apiUrl|model|organizationId|customHeaders)["']?\s*[:=]\s*["']([^"']{4,})["']/;
const PLACEHOLDER_PATTERN = /^(?:your[-_ ]|replace[-_ ]|placeholder|example|sample|dummy|test|changeme|undefined|null|none)/i;

function displayPath(file: string, root: string): string {
  const path = relative(root, file).replaceAll("\\", "/");
  return path || basename(root);
}

function hasForbiddenSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]/u).some((segment) => FORBIDDEN_SEGMENTS.has(segment.toLowerCase()));
}

function hasSuspiciousGenericKey(content: string): boolean {
  const match = content.match(GENERIC_KEY_PATTERN);
  return Boolean(match?.[1] && !PLACEHOLDER_PATTERN.test(match[1]));
}

function hasSuspiciousAiSetting(content: string): boolean {
  const match = content.match(AI_SETTING_PATTERN);
  return Boolean(match?.[1] && !PLACEHOLDER_PATTERN.test(match[1]));
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function auditProductionDirectory(directory = "dist"): Promise<AuditViolation[]> {
  const root = resolve(directory);
  let files: string[];
  try {
    files = await collectFiles(root);
  } catch {
    return [{ file: displayPath(root, dirname(root)), rule: "missing-production-directory" }];
  }

  const violations: AuditViolation[] = [];
  for (const file of files) {
    const path = displayPath(file, root);
    const relativePath = relative(root, file);
    if (hasForbiddenSegment(relativePath)) {
      violations.push({ file: path, rule: "forbidden-path" });
      continue;
    }
    if (TEST_SOURCE_PATTERN.test(basename(file))) {
      violations.push({ file: path, rule: "test-source" });
      continue;
    }

    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      violations.push({ file: path, rule: "read-error" });
      continue;
    }
    if (OPENAI_KEY_PATTERN.test(content) || hasSuspiciousGenericKey(content)) {
      violations.push({ file: path, rule: "hard-coded-api-key" });
    }
    if (hasSuspiciousAiSetting(content)) {
      violations.push({ file: path, rule: "hard-coded-ai-setting" });
    }
  }
  return violations;
}

export function formatAuditViolations(violations: readonly AuditViolation[]): string {
  return violations.map(({ file, rule }) => `${file}: ${rule}`).join("\n");
}

async function main(): Promise<void> {
  const violations = await auditProductionDirectory(process.argv[2] ?? "dist");
  if (violations.length > 0) {
    process.stderr.write(`${formatAuditViolations(violations)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Production audit passed\n");
}

const invokedFile = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedFile) void main();
