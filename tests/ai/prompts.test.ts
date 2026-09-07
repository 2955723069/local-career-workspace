import { describe, expect, it } from "vitest";

import { buildAiContext, REALITY_CONSTRAINT } from "../../src/ai/prompts";

describe("AI prompts", () => {
  it("uses confirmed text and includes a no-fabrication constraint", () => {
    const result = buildAiContext({
      resumeText: "Confirmed resume",
      jdText: "Confirmed JD",
      analysisResult: {
        coverage: { overall: 50, required: 40, preferred: 60 },
        matchedKeywords: ["TypeScript"],
        weakMatches: [],
        missingKeywords: ["Testing"],
        evidence: [],
        uncertainItems: [],
        recommendations: [],
      },
    });
    expect(result.system).toContain(REALITY_CONSTRAINT);
    expect(result.user).toContain("Confirmed resume");
    expect(result.user).toContain("Confirmed JD");
    expect(result.user).not.toContain("originalFile");
  });
});
