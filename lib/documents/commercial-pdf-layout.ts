import type { ProposalPdfDocument } from "@/src/infrastructure/document/pdfkit/ProposalPdfShared";

/** Commercial-only typography; the frozen proposal renderer keeps its defaults. */
export const COMMERCIAL_LABEL_STYLE = {
  font: "VOKA-Semibold",
  subject: 10,
  field: 8,
  compact: 7.5,
  section: 9,
  summary: 11,
  table: 7.8,
  total: 8.5,
  strongTotal: 9.5,
} as const;

export const COMMERCIAL_ROW_STYLE = { fontSize: 7.2, padding: 4, minHeight: 24 } as const;

/** Wrap logical text before bidi rendering, using the same font and width as drawing.
 * Long unbroken identifiers are split only when they cannot fit a whole line.
 */
export function wrapCommercialText(doc: ProposalPdfDocument, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    let line = "";
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (doc.widthOfString(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const character of Array.from(word)) {
        if (line && doc.widthOfString(line + character) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function commercialRowHeight(lineCount: number, lineHeight: number): number {
  return Math.max(COMMERCIAL_ROW_STYLE.minHeight, lineCount * lineHeight + COMMERCIAL_ROW_STYLE.padding * 2);
}
