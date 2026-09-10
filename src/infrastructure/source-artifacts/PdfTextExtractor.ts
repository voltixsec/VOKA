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

function decodeStreamPayload(payload: Buffer, dictionary: string) {
  if (/\/FlateDecode/iu.test(dictionary)) {
    try { return inflateRawSync(payload).toString("latin1"); } catch {
      try { return inflateSync(payload).toString("latin1"); } catch { return ""; }
    }
  }
  return payload.toString("latin1");
}

function decodedStreams(objectText: string) {
  const chunks: string[] = [];
  for (const match of objectText.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/gu)) {
    const payload = Buffer.from(match[1] ?? "", "latin1");
    chunks.push(decodeStreamPayload(payload, objectText.slice(0, match.index ?? 0)));
  }
  return chunks;
}

function objectBodies(raw: string) {
  const objects = new Map<number, string>();
  for (const match of raw.matchAll(/(?:^|\n)(\d+)\s+\d+\s+obj\s*([\s\S]*?)\s*endobj/gu)) {
    const id = Number(match[1]);
    if (Number.isInteger(id)) objects.set(id, match[2] ?? "");
  }
  return objects;
}

function referencedContents(pageObject: string, objects: Map<number, string>) {
  const contents = pageObject.match(/\/Contents\s+(\[[\s\S]*?\]|\d+\s+\d+\s+R)/u)?.[1] ?? "";
  const references = [...contents.matchAll(/(\d+)\s+\d+\s+R/gu)].map((match) => Number(match[1]));
  return references.flatMap((id) => objects.get(id) ? decodedStreams(objects.get(id)!) : []);
}

function normalizeText(value: string) {
  return value.replace(/[ \t]+/gu, " ").replace(/\n{2,}/gu, "\n").trim();
}

export function extractPdfText(bytes: Uint8Array): ExtractedPdf {
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("PDF_CONTENT_INVALID");
  const raw = buffer.toString("latin1");
  const objects = objectBodies(raw);
  const pageObjects = [...objects.values()].filter((body) => /\/Type\s*\/Page(?!s)/u.test(body));
  const pageTexts = pageObjects.map((pageObject) => {
    const contents = referencedContents(pageObject, objects);
    const streams = contents.length ? contents : decodedStreams(pageObject);
    return normalizeText(streams.map(operatorText).filter(Boolean).join("\n"));
  });
  const fallbackStreams = [...objects.values()].flatMap(decodedStreams);
  const fallbackText = normalizeText(fallbackStreams.map(operatorText).filter(Boolean).join("\n"));
  const explicitPages = fallbackText.split("\f").map((text) => normalizeText(text)).filter(Boolean);
  const hasPageText = pageTexts.some(Boolean);
  const pages: ArtifactPage[] = hasPageText
    ? pageTexts.map((text, index) => ({ pageNumber: index + 1, text, characterCount: text.length }))
    : explicitPages.length > 1
      ? explicitPages.map((text, index) => ({ pageNumber: index + 1, text, characterCount: text.length }))
      : Array.from({ length: Math.max(1, pageObjects.length) }, (_, index) => {
          const text = index === 0 ? fallbackText : "";
          return { pageNumber: index + 1, text, characterCount: text.length };
        });
  const text = normalizeText(pages.map((page) => page.text).filter(Boolean).join("\n")) || fallbackText;
  return { text, pages };
}
