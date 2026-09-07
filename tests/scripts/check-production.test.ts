import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { auditProductionDirectory, formatAuditViolations } from "../../scripts/check-production";

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "c3-production-audit-"));
}

describe("production bundle audit", () => {
  it("accepts a clean static bundle", async () => {
    const root = await temporaryDirectory();
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), "<main>local app</main>");
    await writeFile(join(root, "assets", "index.js"), "console.log('ready')");

    expect(await auditProductionDirectory(root)).toEqual([]);
  });

  it("allows documented placeholder AI settings", async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, "settings.js"), 'const apiKey = "your-key-placeholder";');

    expect(await auditProductionDirectory(root)).toEqual([]);
  });

  it("flags test source files even when they are at the bundle root", async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, "workflow.spec.ts"), "export const testOnly = true;");

    expect(await auditProductionDirectory(root)).toEqual([
      { file: "workflow.spec.ts", rule: "test-source" },
    ]);
  });

  it("reports test and dependency paths without exposing file contents", async () => {
    const root = await temporaryDirectory();
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "workflow.spec.ts"), "resume body secret");
    await writeFile(join(root, "node_modules", "pkg", "index.js"), "dependency");

    const violations = await auditProductionDirectory(root);
    const output = formatAuditViolations(violations);

    expect(violations.map(({ rule }) => rule)).toEqual([
      "forbidden-path",
      "forbidden-path",
    ]);
    expect(output).toContain("forbidden-path");
    expect(output).not.toContain("resume body secret");
  });

  it("rejects hard-coded API keys and sensitive AI settings", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      join(root, "assets.js"),
      'const settings={"apiKey":"sk-proj-123456789012345678901234","apiUrl":"https://example.invalid/v1"};',
    );

    const violations = await auditProductionDirectory(root);
    const output = formatAuditViolations(violations);

    expect(violations.map(({ rule }) => rule)).toEqual([
      "hard-coded-api-key",
      "hard-coded-ai-setting",
    ]);
    expect(output).toBe("assets.js: hard-coded-api-key\nassets.js: hard-coded-ai-setting");
    expect(output).not.toContain("sk-proj");
    expect(output).not.toContain("example.invalid");
  });
});
