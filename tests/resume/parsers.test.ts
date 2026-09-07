import { afterEach, describe, expect, it, vi } from "vitest";

import { parseDocx } from "../../src/parsers/docx";
import { parsePdf } from "../../src/parsers/pdf";
import { makeDocx, makePdf } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local resume parsers", () => {
  it("extracts text from a PDF ArrayBuffer without making a request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const bytes = makePdf("PDF resume evidence");

    const text = await parsePdf(bytes.buffer as ArrayBuffer);

    expect(text).toContain("PDF resume evidence");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("extracts text from a DOCX ArrayBuffer without making a request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const bytes = makeDocx("DOCX resume evidence");

    const text = await parseDocx(bytes.buffer as ArrayBuffer);

    expect(text).toContain("DOCX resume evidence");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["PDF", parsePdf, new TextEncoder().encode("not private resume content")],
    ["DOCX", parseDocx, new TextEncoder().encode("not private resume content")],
  ] as const)("rejects malformed %s bytes without exposing them", async (_kind, parse, bytes) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const rejection = await parse(bytes.buffer as ArrayBuffer).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(Error);
    expect(JSON.stringify(rejection)).not.toContain("private resume content");
    expect(String(rejection)).not.toContain("private resume content");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
