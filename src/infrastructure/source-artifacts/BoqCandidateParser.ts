import type { RequirementCandidate, ToolCitation } from "@/src/application/conversation-runtime";

export function parseBoqCandidates(text: string, artifactId: string, citations: ToolCitation[]): RequirementCandidate[] {
  const candidates: RequirementCandidate[] = [];
  const units = "(?:each|ea|pcs?|nos?|units?|m2|m²|m|kg|set|lot)";
  const linePattern = new RegExp(`^\\s*(\\d{1,4})[.)\\s-]+(.+?)\\s+(${units})\\s*$`, "iu");
  for (const [index, line] of text.split(/\r?\n/gu).entries()) {
    const match = line.match(linePattern);
    if (!match) continue;
    const description = match[2]?.replace(/\s+/gu, " ").trim();
    if (!description || description.length < 2) continue;
    const citation = citations.find((item) => item.sourceArtifactId === artifactId && item.supportedClaimSummary.includes(line.trim()));
    candidates.push({ stableKey: `artifact:${artifactId}:boq:${index + 1}`, description, quantity: Number(match[1]), unit: match[3], technicalRequirement: description, quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW", citationId: citation?.id });
  }
  return candidates.slice(0, 100);
}
