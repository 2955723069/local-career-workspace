import type { AnalysisResult } from "../db/types";

export const REALITY_CONSTRAINT =
  "Do not invent or infer the user's experience, skills, education, achievements, employers, or quantitative results. If information is uncertain or missing, ask the user before making a claim. 不得虚构经历、技能、学历、成果或量化数据；不确定内容必须先询问用户。";

export interface AiContextInput {
  resumeText: string;
  jdText: string;
  analysisResult?: Pick<
    AnalysisResult,
    | "coverage"
    | "matchedKeywords"
    | "weakMatches"
    | "missingKeywords"
    | "evidence"
    | "uncertainItems"
    | "recommendations"
  >;
}

export interface AiContext {
  system: string;
  user: string;
}

export function buildAiContext(input: AiContextInput): AiContext {
  if (!input.resumeText.trim()) throw new Error("Confirmed resume text is required");
  if (!input.jdText.trim()) throw new Error("Confirmed JD text is required");

  const analysis = input.analysisResult
    ? JSON.stringify({
        coverage: input.analysisResult.coverage,
        matchedKeywords: input.analysisResult.matchedKeywords,
        weakMatches: input.analysisResult.weakMatches,
        missingKeywords: input.analysisResult.missingKeywords,
        evidence: input.analysisResult.evidence,
        uncertainItems: input.analysisResult.uncertainItems,
        recommendations: input.analysisResult.recommendations,
      })
    : "No local matching result was provided.";

  return {
    system: `${REALITY_CONSTRAINT}\nProvide evidence-based suggestions only. Mark every proposed change as a suggestion; never modify the source resume file.`,
    user: [
      "Use only the confirmed resume text and confirmed job-description text below.",
      "CONFIRMED RESUME TEXT:",
      input.resumeText,
      "CONFIRMED JOB DESCRIPTION TEXT:",
      input.jdText,
      "OPTIONAL LOCAL MATCHING RESULT (text evidence only):",
      analysis,
    ].join("\n\n"),
  };
}
