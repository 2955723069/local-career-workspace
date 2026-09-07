import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeKeyword } from "../../src/matching/normalization";
import { runLocalMatch, scoreKeywords } from "../../src/matching/scoring";
import type { KeywordDefinition } from "../../src/matching/types";

function keyword(
  original: string,
  category: KeywordDefinition["category"],
  requirement: KeywordDefinition["requirement"] = "required",
): KeywordDefinition {
  return normalizeKeyword(original, { category, requirement });
}

describe("explainable local matching score", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    localStorage.clear();
  });

  it("distinguishes exact, synonym, weak-context, missing, and manual-review results", () => {
    const resumeText = [
      "项目经历：使用 TypeScript 构建内部工具。",
      "参与人工智能产品的数据分析。",
      "目前正在学习 Kubernetes，尚无生产实践。",
      "2022 年至今负责后端开发。",
    ].join("\n");
    const keywords = [
      keyword("Type Script", "skill"),
      keyword("AI", "skill"),
      keyword("Kubernetes", "platform", "preferred"),
      keyword("Go", "skill"),
      keyword("3 年以上开发经验", "experience"),
    ];

    const result = scoreKeywords(resumeText, keywords);

    expect(result.items.map(({ original, status }) => ({ original, status }))).toEqual([
      { original: "Type Script", status: "exact" },
      { original: "AI", status: "synonym" },
      { original: "Kubernetes", status: "weak-context" },
      { original: "Go", status: "missing" },
      { original: "3 年以上开发经验", status: "needs-review" },
    ]);
    expect(result.matched).toHaveLength(2);
    expect(result.weakMatches).toHaveLength(1);
    expect(result.missing).toHaveLength(1);
    expect(result.needsReview).toHaveLength(1);

    for (const item of [...result.matched, ...result.weakMatches, ...result.needsReview]) {
      expect(item.evidence).toBeTruthy();
      expect(resumeText).toContain(item.evidence!);
    }
    expect(result.missing[0]?.evidence).toBeUndefined();
    expect(result.needsReview[0]?.uncertain).toBe(true);
    expect(result.disclaimer).toMatch(/文本证据/);
  });

  it("reports weighted overall, required, and preferred coverage with explicit denominators", () => {
    const result = scoreKeywords("TypeScript。正在学习 React。", [
      keyword("TypeScript", "skill"),
      keyword("Go", "skill"),
      keyword("React", "framework", "preferred"),
      keyword("AWS", "platform", "preferred"),
    ]);

    expect(result.coverage).toEqual({ overall: 37.5, required: 50, preferred: 25 });
    expect(result.coverageDetails).toEqual({
      overall: { earned: 1.5, total: 4, percentage: 37.5 },
      required: { earned: 1, total: 2, percentage: 50 },
      preferred: { earned: 0.5, total: 2, percentage: 25 },
    });
  });

  it("returns zero coverage with zero denominators for an empty keyword set", () => {
    const result = scoreKeywords("unchanged resume", []);

    expect(result.coverage).toEqual({ overall: 0, required: 0, preferred: 0 });
    expect(result.coverageDetails).toEqual({
      overall: { earned: 0, total: 0, percentage: 0 },
      required: { earned: 0, total: 0, percentage: 0 },
      preferred: { earned: 0, total: 0, percentage: 0 },
    });
  });

  it("uses no network or browser storage and is identical online and offline", () => {
    const originalJd = "必须掌握 TypeScript；React 为加分项。";
    const originalResume = "使用 TypeScript 开发，正在学习 React。";
    const fetchSpy = vi.fn(() => Promise.reject(new Error("network forbidden")));
    let xhrCalls = 0;
    class ForbiddenXmlHttpRequest {
      constructor() {
        xhrCalls += 1;
      }
    }
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", ForbiddenXmlHttpRequest);
    const indexedDbSpy = vi.spyOn(indexedDB, "open");
    localStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });

    const online = runLocalMatch(originalJd, originalResume);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const offline = runLocalMatch(originalJd, originalResume);

    expect(offline).toEqual(online);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrCalls).toBe(0);
    expect(indexedDbSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(originalJd).toBe("必须掌握 TypeScript；React 为加分项。");
    expect(originalResume).toBe("使用 TypeScript 开发，正在学习 React。");
  });
});
