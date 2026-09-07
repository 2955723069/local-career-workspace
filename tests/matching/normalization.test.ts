import { describe, expect, it } from "vitest";

import {
  extractKeywords,
  groupKeywords,
  normalizeKeyword,
  normalizeText,
} from "../../src/matching/normalization";

describe("local matching normalization", () => {
  it("normalizes case, width, spacing, punctuation, and common Chinese-English variants", () => {
    expect(normalizeText("  Ｔｙｐｅ Script，React．JS / 人工智能  ")).toBe(
      "type script react js 人工智能",
    );
    expect(normalizeKeyword("Type Script").canonical).toBe("typescript");
    expect(normalizeKeyword("React.JS").canonical).toBe("react");
    expect(normalizeKeyword("AI").canonical).toBe("人工智能");
    expect(normalizeKeyword("人工智能").canonical).toBe("人工智能");
  });

  it("extracts required and preferred keywords into groups without losing display forms", () => {
    const jdText = [
      "任职要求",
      "- 必须熟练掌握 Type Script、React.JS 和 MySQL。",
      "- 具备良好的沟通能力，本科及以上学历。",
      "加分项",
      "- AWS 平台经验优先。",
      "- 持有 PMP 证书优先。",
      "- 英语六级。",
      "- 3 年以上开发经验。",
      "- 负责需求分析与系统设计。",
    ].join("\n");

    const keywords = extractKeywords(jdText);
    const grouped = groupKeywords(keywords);

    expect(keywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          original: "Type Script",
          canonical: "typescript",
          category: "skill",
          requirement: "required",
        }),
        expect.objectContaining({
          original: "React.JS",
          category: "framework",
          requirement: "required",
        }),
        expect.objectContaining({
          original: "AWS",
          category: "platform",
          requirement: "preferred",
        }),
        expect.objectContaining({ original: "PMP", category: "certification" }),
        expect.objectContaining({ original: "英语六级", category: "language" }),
        expect.objectContaining({ original: "本科", category: "education" }),
        expect.objectContaining({
          original: "3 年以上开发经验",
          category: "experience",
        }),
        expect.objectContaining({
          original: "负责需求分析与系统设计",
          category: "responsibility",
        }),
      ]),
    );
    expect(grouped.framework.map((item) => item.original)).toContain("React.JS");
    expect(grouped.platform.map((item) => item.original)).toContain("AWS");
    expect(jdText).toContain("Type Script、React.JS");
  });

  it("keeps required and preferred markers scoped to their clauses", () => {
    const keywords = extractKeywords(
      "必须掌握 TypeScript；React 为加分项。Preferred: AWS。",
    );

    expect(keywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ original: "TypeScript", requirement: "required" }),
        expect.objectContaining({ original: "React", requirement: "preferred" }),
        expect.objectContaining({ original: "AWS", requirement: "preferred" }),
      ]),
    );
  });
});
