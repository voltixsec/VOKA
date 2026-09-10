import { inflateRawSync, inflateSync } from "node:zlib";
import type { ArtifactPage, ExtractedPdf } from "@/src/domain/source-artifact";

function decodeLiteral(value: string) {
  return value
    .replace(/\\([\\()nrt])/gu, (_match, escaped: string) => ({ n: "\n", r: "\r", t: "\t" }[escaped] ?? escaped))
    .replace(/\\([0-7]{1,3})/gu, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function operatorText(content: string) {
  const chunks: string[] = [];
  for (const match of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*TJ?/gu)) chunks.push(decodeLiteral(match[1] ?? ""));
  for (const match of content.matchAll(/<([0-9a-f\s]+)>\s*TJ?/giu)) {
    const hex = (match[1] ?? "").replace(/\s/gu, "");
    if (hex.length % 2 === 0) chunks.push(Buffer.from(hex, "hex").toString("utf8"));
  }
  for (const match of content.matchAll(/\[((?:\([^)]*\)|<[^>]+>|-?\d+(?:\.\d+)?|\s)+)\]\s*TJ/gu)) {
    const values = match[1]?.match(/\(((?:\\.|[^\\)])*)\)|<([0-9a-f\s]+)>/giu) ?? [];
    for (const value of values) {
      if (value.startsWith("(")) chunks.push(decodeLiteral(value.slice(1, -1)));
      else chunks.push(Buffer.from(value.slice(1, -1).replace(/\s/gu, ""), "hex").toString("utf8"));
    }
  }
  return chunks.join("\n").replace(/[ \t]+/gu, " ").replace(/ *\n */gu, "\n").trim();
}

function decodedStreams(bytes: Buffer) {
  const raw = bytes.toString("latin1");
  const chunks: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/gu)) {
    const payload = Buffer.from(match[1] ?? "", "latin1");
    const dictionaryStart = Math.max(0, (match.index ?? 0) - 600);
    const dictionary = raw.slice(dictionaryStart, match.index ?? 0);
    if (/\/FlateDecode/iu.test(dictionary)) {
      try { chunks.push(inflateRawSync(payload, { maxOutputLength: 4 * 1024 * 1024 }).toString("latin1")); continue; } catch { try { chunks.push(inflateSync(payload, { maxOutputLength: 4 * 1024 * 1024 }).toString("latin1")); continue; } catch { /* preserve honest empty extraction */ } }
    }
    chunks.push(payload.toString("latin1"));
  }
  return chunks;
}

export function extractPdfText(bytes: Uint8Array): ExtractedPdf {
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("PDF_CONTENT_INVALID");
  const raw = buffer.toString("latin1");
  if (/\/ToUnicode|\/Identity-[HV]|\/Encrypt/u.test(raw)) return { text: "", pages: [] };
  const streams = decodedStreams(buffer);
  const allText = [...streams.map(operatorText), ...(streams.length ? [] : [operatorText(raw)])].filter(Boolean).join("\n").replace(/[ \t]+/gu, " ").replace(/\n{2,}/gu, "\n").trim();
  // Content streams are not mapped to page objects by this bounded extractor.
  // Unknown attribution is null, including a visually single-page document.
  const pages: ArtifactPage[] = allText ? [{ pageNumber: null, text: allText, characterCount: allText.length }] : [];
  return { text: allText, pages };
}
