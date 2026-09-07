import mammoth from "mammoth/mammoth.browser.js";

const SAFE_DOCX_ERROR = "Unable to extract text from the DOCX file";

export async function parseDocx(data: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: data });
    return result.value.replaceAll("\r\n", "\n").trim();
  } catch {
    throw new Error(SAFE_DOCX_ERROR);
  }
}
