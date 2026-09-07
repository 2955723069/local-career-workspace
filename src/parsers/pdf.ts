import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const SAFE_PDF_ERROR = "Unable to extract text from the PDF file";

export async function parsePdf(data: ArrayBuffer): Promise<string> {
  const sourceBytes = new Uint8Array(data.slice(0));
  let loadingTask: ReturnType<typeof getDocument> | undefined;

  try {
    loadingTask = getDocument({
      data: sourceBytes,
      useWorkerFetch: false,
      disableFontFace: true,
      useSystemFonts: false,
    });
    const document = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let currentLine = "";

      for (const item of content.items) {
        if (!("str" in item)) continue;
        const textItem = item as { str: string; hasEOL?: boolean };
        currentLine += textItem.str;
        if (textItem.hasEOL) {
          lines.push(currentLine.trimEnd());
          currentLine = "";
        } else if (textItem.str && !textItem.str.endsWith(" ")) {
          currentLine += " ";
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trimEnd());
      pages.push(lines.join("\n").trim());
      page.cleanup();
    }

    await Promise.resolve(loadingTask.destroy());
    return pages.filter(Boolean).join("\n\n");
  } catch (error) {
    await Promise.resolve(loadingTask?.destroy()).catch(() => undefined);
    // 加密/受密码保护的 PDF：内容流是密文，正则回退只会抓到随机乱码，直接判为提取失败。
    if (isPasswordError(error)) throw new Error(SAFE_PDF_ERROR);
    const fallback = extractSimplePdfText(sourceBytes);
    if (fallback && isMostlyReadable(fallback)) return fallback;
    throw new Error(SAFE_PDF_ERROR);
  }
}

/** pdfjs 对加密文件抛 PasswordException（name 为 "PasswordException"）。 */
function isPasswordError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "PasswordException");
}

/** 判断回退文本是否“大体可读”：可打印字符（含 CJK）占比足够高，否则视为二进制乱码丢弃。 */
function isMostlyReadable(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (!sample) return false;
  let readable = 0;
  for (const char of sample) {
    const code = char.codePointAt(0) ?? 0;
    // 允许常见空白、可打印 ASCII 和非 ASCII（中文等）；排除控制字符与替换符。
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127 && code !== 0xfffd)) readable += 1;
  }
  return readable / [...sample].length >= 0.85;
}

function extractSimplePdfText(data: Uint8Array): string | undefined {
  const source = new TextDecoder("latin1").decode(data);
  if (!source.startsWith("%PDF-")) return undefined;
  const values: string[] = [];
  for (const match of source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    const value = match[1];
    if (!value) continue;
    values.push(value.replaceAll(/\\([\\()])/g, "$1"));
  }
  return values.join("\n").trim() || undefined;
}
