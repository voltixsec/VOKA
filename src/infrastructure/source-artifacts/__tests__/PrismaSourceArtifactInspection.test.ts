import { describe, expect, it } from "vitest";
import { parseBoqCandidates } from "../BoqCandidateParser";

describe("conservative BOQ candidate parsing", () => {
  it("keeps extracted quantities review-required and attaches a page citation", () => {
    const result = parseBoqCandidates("1 IP camera 4MP each\n12 CAT6 cable m", "artifact-1", [{ id: "citation-1", sourceArtifactId: "artifact-1", sourceType: "SOURCE_ARTIFACT_TEXT", title: "boq.pdf", pageNumber: 1, provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", supportedClaimSummary: "BOQ" }]);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: 1, unit: "each", quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW", citationId: "citation-1" }),
      expect.objectContaining({ quantity: 12, unit: "m", quantityStatus: "EXTRACTED_REVIEW_REQUIRED" }),
    ]));
  });

  it("uses the candidate page when more than one PDF page is available", () => {
    const result = parseBoqCandidates([
      { pageNumber: 1, text: "1 camera each" },
      { pageNumber: 2, text: "12 CAT6 cable m" },
    ], "artifact-1", [
      { id: "citation-1", sourceArtifactId: "artifact-1", sourceType: "SOURCE_ARTIFACT_TEXT", title: "boq.pdf", pageNumber: 1, provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", supportedClaimSummary: "page one" },
      { id: "citation-2", sourceArtifactId: "artifact-1", sourceType: "SOURCE_ARTIFACT_TEXT", title: "boq.pdf", pageNumber: 2, provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", supportedClaimSummary: "page two" },
    ]);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: 12, citationId: "citation-2", stableKey: "artifact:artifact-1:boq:2:1" }),
    ]));
  });
});
