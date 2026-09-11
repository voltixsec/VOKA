import type { RequirementCandidate, ToolCitation } from "@/src/application/conversation-runtime";
import { artifactBoqRequirementKey, requirementStableKey, type RequirementIdentityScope } from "@/src/application/source-artifacts";
import type { ArtifactPage } from "@/src/domain/source-artifact";

const UNITS = "(?:each|ea|pcs?|nos?|units?|m2|m²|m|kg|set|lot)";
const LINE_PATTERN = new RegExp(`^\\s*(\\d{1,4})[.)\\s-]+(.+?)\\s+(${UNITS})\\s*$`, "iu");

export type BoqParseInput = {
  text: string;
  artifactId: string;
  citations: ToolCitation[];
  /** Page texts retained at ingestion; used to prove which page a BOQ line came from. */
  pages?: ArtifactPage[] | null;
  scope: RequirementIdentityScope;
};

function normalizeLine(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

/**
 * Claim-specific citation resolution. A citation is linked to a BOQ line only when the exact line text is provably
 * present on a page that has a citation with that page number. If the line cannot be located on a page — or the
 * artifact has no page attribution at all — the requirement stays unlinked (pending human review).
 */
function citationForLine(line: string, pages: ArtifactPage[] | null | undefined, citations: ToolCitation[]) {
  if (!pages?.length) return undefined;
  const needle = normalizeLine(line);
  if (!needle) return undefined;
  const located = pages.filter((page) => normalizeLine(page.text).includes(needle));
  if (located.length !== 1) return undefined;
  const pageNumber = located[0]!.pageNumber;
  const matching = citations.filter((citation) => citation.id && citation.sourceArtifactId && citation.pageNumber === pageNumber);
  return matching.length === 1 ? matching[0] : undefined;
}

export function parseBoqCandidates(input: BoqParseInput): RequirementCandidate[] {
  const candidates: RequirementCandidate[] = [];
  for (const [index, line] of input.text.split(/\r?\n/gu).entries()) {
    const match = line.match(LINE_PATTERN);
    if (!match) continue;
    const description = match[2]?.replace(/\s+/gu, " ").trim();
    if (!description || description.length < 2) continue;
    const citation = citationForLine(line, input.pages, input.citations.filter((item) => item.sourceArtifactId === input.artifactId));
    candidates.push({
      stableKey: requirementStableKey(input.scope, artifactBoqRequirementKey(input.artifactId, index + 1)),
      description, quantity: Number(match[1]), unit: match[3], technicalRequirement: description,
      quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW", citationId: citation?.id,
    });
  }
  return candidates.slice(0, 100);
}
