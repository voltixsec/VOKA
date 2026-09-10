import type { RequirementCandidate, ToolCitation } from "@/src/application/conversation-runtime";

type CandidatePage = { pageNumber: number; text: string };

export function parseBoqCandidates(source: string | CandidatePage[], artifactId: string, citations: ToolCitation[]): RequirementCandidate[] {
  const pages: CandidatePage[] = typeof source === "string" ? [{ pageNumber: 1, text: source }] : source;
  const candidates: RequirementCandidate[] = [];
  const units = "(?:each|ea|pcs?|nos?|units?|m2|m²|m|kg|set|lot)";
  const linePattern = new RegExp(`^\\s*(\\d{1,4})[.)\\s-]+(.+?)\\s+(${units})\\s*$`, "iu");
  for (const page of pages) {
    for (const [lineIndex, line] of page.text.split(/\r?\n/gu).entries()) {
      const match = line.match(linePattern);
      if (!match) continue;
      const description = match[2]?.replace(/\s+/gu, " ").trim();
      if (!description || description.length < 2) continue;
      const citation = citations.find((item) => item.pageNumber === page.pageNumber) ?? citations[0];
      candidates.push({ stableKey: `artifact:${artifactId}:boq:${page.pageNumber}:${lineIndex + 1}`, description, quantity: Number(match[1]), unit: match[3], technicalRequirement: description, quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW", citationId: citation?.id });
    }
  }
  return candidates.slice(0, 100);
}
