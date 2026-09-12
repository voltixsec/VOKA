/**
 * Phase 2A-10: the comparison engine, end to end, over the real engine and the
 * real in-memory store.
 *
 * What these tests protect:
 * - a quantity disagreement between two derivation families is STATED, never
 *   resolved: no approved quantity, no winner, no correct value;
 * - a re-run over unchanged evidence is idempotent;
 * - changing a value does NOT mint a new finding, and it does not erase the
 *   human review state;
 * - a finding whose evidence disappeared becomes stale and is never deleted;
 * - a document role never changes a finding's kind, severity, or statement.
 */

import { describe, expect, it } from "vitest";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { buildHarness, claimFor, makeArtifact, type MaterializationFactory } from "./harness";
import { containsWinnerLanguage } from "@/src/domain/cross-document";
import { getFindingDetail } from "@/src/application/cross-document/ReadModels";
import { transitionFindingReview } from "@/src/application/cross-document/FindingReviewService";
import type { CrossDocumentStore } from "@/src/application/cross-document/ports";

const SPEC = makeArtifact({ artifactId: "artifact-spec", kind: "PDF", filename: "spec.pdf" });
const BOQ = makeArtifact({ artifactId: "artifact-boq", kind: "XLSX", filename: "boq.xlsx" });

/** Mutable scenario, so a test can change evidence between runs. */
type Scenario = {
  specLiteral: string;
  boqValue: string;
  boqNumber: number | null;
  includeBoqQuantity: boolean;
};

/**
 * Two derivation families stating the same subject: a specification page and a
 * workbook line. The PDF literal stays a literal; only the workbook claim
 * carries the numeric view its own model supplied.
 */
function factoryFor(scenario: Scenario): MaterializationFactory {
  return ({ artifact, lineage }) => {
    const isSpec = artifact.artifactId === SPEC.artifactId;
    const claims = isSpec
      ? [
        claimFor({
          artifact,
          lineage,
          predicate: "STATED_QUANTITY",
          subjectKeyNamespace: "EQUIPMENT_TAG",
          subjectKeyValue: "AHU-01",
          subjectMatchKey: "AHU01",
          valueLiteral: scenario.specLiteral,
          unit: "nos",
          quantityOrigin: "STATED",
          locator: "p. 3 row 4",
          pageNumber: 3,
        }),
      ]
      : scenario.includeBoqQuantity
        ? [
          claimFor({
            artifact,
            lineage,
            predicate: "STATED_QUANTITY",
            subjectKeyNamespace: "EQUIPMENT_TAG",
            subjectKeyValue: "AHU-01",
            subjectMatchKey: "AHU01",
            valueLiteral: scenario.boqValue,
            sourceSuppliedNumber: scenario.boqNumber,
            unit: "nos",
            quantityOrigin: "STATED",
            locator: "row 12 column D",
            readingChannel: "WORKBOOK_STRUCTURED",
            materializerVersion: "2a-10.materializer.workbook.v1",
          }),
        ]
        : [];
    return {
      artifact,
      lineage,
      materializationId: `mat_${artifact.artifactId}`,
      materializerVersion: "2a-10.materializer.test.v1",
      readingChannels: ["PDF_NATIVE_TEXT", "WORKBOOK_STRUCTURED"],
      coverage: "COMPLETE",
      claims,
      truncated: false,
      truncationReasons: [],
      warnings: [],
      limitations: [],
      unavailable: false,
    };
  };
}

function runner(input: { scenario: Scenario; roles?: Record<string, "SPECIFICATION" | "BOQ" | "UNKNOWN"> }) {
  const harnessPromise = buildHarness({ artifacts: [SPEC, BOQ], factory: factoryFor(input.scenario), roles: input.roles });
  return {
    async run(times = 1) {
      const harness = await harnessPromise;
      let last: Awaited<ReturnType<typeof runCrossDocumentComparison>> | null = null;
      for (let index = 0; index < times; index += 1) {
        last = await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
      }
      return { harness, run: last! };
    },
  };
}

async function findingsOf(store: CrossDocumentStore, scopeId: string) {
  return store.listFindings({ companyId: "company-1", comparisonScopeId: scopeId, limit: 50 });
}

describe("cross-document comparison engine", () => {
  it("states a stated-quantity disagreement once, without resolving it", async () => {
    const { harness, run } = await runner({ scenario: { specLiteral: "24", boqValue: "26", boqNumber: 26, includeBoqQuantity: true } }).run();
    expect(run.status).toBe("COMPLETED");
    expect(run.findingCount).toBe(1);

    const findings = await findingsOf(harness.store, harness.scopeId);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.findingKind).toBe("STATED_QUANTITY_MISMATCH");
    expect(findings[0]!.severity).toBe("ATTENTION");

    const detail = await getFindingDetail({ companyId: "company-1", store: harness.store, locale: "en", findingId: findings[0]!.findingId });
    expect(detail).not.toBeNull();
    expect(detail!.participants).toHaveLength(2);
    expect(detail!.statement.participantLines).toHaveLength(2);
    expect(detail!.participants.map((participant) => participant.verbatimValue).sort()).toEqual(["24", "26"]);

    // Only the workbook's own model supplied a numeric view.
    const sheetParticipant = detail!.participants.find((participant) => participant.sourceArtifactId === BOQ.artifactId)!;
    const specParticipant = detail!.participants.find((participant) => participant.sourceArtifactId === SPEC.artifactId)!;
    expect(sheetParticipant.sourceNumericView).toBe(26);
    expect(specParticipant.sourceNumericView).toBeNull();

    // The statement never crowns a side, in either language, and the Arabic
    // rendering is a real Arabic sentence, not the English one.
    expect(containsWinnerLanguage(detail!.statement.text)).toBe(false);
    const arabic = await getFindingDetail({ companyId: "company-1", store: harness.store, locale: "ar", findingId: findings[0]!.findingId });
    expect(arabic!.statement.text).not.toBe(detail!.statement.text);
    expect(/[\u0600-\u06FF]/u.test(arabic!.statement.text)).toBe(true);
    expect(containsWinnerLanguage(arabic!.statement.text)).toBe(false);
  });

  it("is idempotent over identical evidence", async () => {
    const { harness, run } = await runner({ scenario: { specLiteral: "24", boqValue: "26", boqNumber: 26, includeBoqQuantity: true } }).run(2);
    expect(run.newFindingCount).toBe(0);
    expect(run.reproducedFindingCount).toBe(1);
    const findings = await findingsOf(harness.store, harness.scopeId);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.engineFlags.stale).toBe(false);
    expect(findings[0]!.engineFlags.evidenceChanged).toBe(false);
  });

  it("keeps finding identity when a value changes and preserves the human review state", async () => {
    const scenario: Scenario = { specLiteral: "24", boqValue: "26", boqNumber: 26, includeBoqQuantity: true };
    const { harness, run } = await runner({ scenario }).run();
    const [first] = await findingsOf(harness.store, harness.scopeId);
    expect(run.findingCount).toBe(1);

    // A reviewer acknowledges the finding.
    const review = await transitionFindingReview({
      store: harness.store,
      command: { companyId: "company-1", findingId: first!.findingId, actorUserId: "user-1", toState: "ACKNOWLEDGED", reason: "reviewing with the consultant", at: "2026-09-12T01:00:00.000Z" },
    });
    expect(review.ok).toBe(true);

    // The workbook now states a different quantity.
    scenario.boqValue = "28";
    scenario.boqNumber = 28;
    const second = await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });

    const after = await findingsOf(harness.store, harness.scopeId);
    // Same logical finding: identity excludes the current values.
    expect(after).toHaveLength(1);
    expect(after[0]!.findingId).toBe(first!.findingId);
    expect(second.newFindingCount).toBe(0);
    expect(after[0]!.engineFlags.evidenceChanged).toBe(true);
    // The human review state is untouched by the engine.
    expect(after[0]!.reviewState).toBe("ACKNOWLEDGED");

    const detail = await getFindingDetail({ companyId: "company-1", store: harness.store, locale: "en", findingId: after[0]!.findingId });
    expect(detail!.participants.map((participant) => participant.verbatimValue).sort()).toEqual(["24", "28"]);
    expect(detail!.evidenceSignatureHash).not.toBe(first!.evidenceSignature.signatureHash);
  });

  it("marks a finding stale when its evidence disappears, and never deletes it", async () => {
    const scenario: Scenario = { specLiteral: "24", boqValue: "26", boqNumber: 26, includeBoqQuantity: true };
    const { harness } = await runner({ scenario }).run();
    const [first] = await findingsOf(harness.store, harness.scopeId);
    expect(first).toBeDefined();

    scenario.includeBoqQuantity = false;
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });

    const after = await findingsOf(harness.store, harness.scopeId);
    const same = after.find((finding) => finding.findingId === first!.findingId);
    expect(same).toBeDefined();
    // Still present, engine-flagged stale, and the reason is recorded.
    expect(same!.engineFlags.stale).toBe(true);
    expect(same!.engineFlags.reproduced).toBe(false);
    // The workbook no longer states that value at all: the old claim is not
    // mutated or deleted, it is simply no longer produced — and the flag says so.
    expect(same!.engineFlags.staleReason).toBe("CLAIMS_SUPERSEDED");
    // A stale finding is not a resolved finding: the review state is unchanged.
    expect(same!.reviewState).toBe("OPEN");
  });

  it("lets a document role organize the review without changing a finding", async () => {
    const scenario: Scenario = { specLiteral: "24", boqValue: "26", boqNumber: 26, includeBoqQuantity: true };
    const asCouldBe = await runner({ scenario, roles: { [SPEC.artifactId]: "SPECIFICATION", [BOQ.artifactId]: "BOQ" } }).run();
    const [before] = await findingsOf(asCouldBe.harness.store, asCouldBe.harness.scopeId);
    const beforeDetail = await getFindingDetail({ companyId: "company-1", store: asCouldBe.harness.store, locale: "en", findingId: before!.findingId });

    const reorderedScenario: Scenario = { ...scenario };
    const reordered = await runner({ scenario: reorderedScenario, roles: { [SPEC.artifactId]: "BOQ", [BOQ.artifactId]: "SPECIFICATION" } }).run();
    const [after] = await findingsOf(reordered.harness.store, reordered.harness.scopeId);
    const afterDetail = await getFindingDetail({ companyId: "company-1", store: reordered.harness.store, locale: "en", findingId: after!.findingId });

    expect(after!.findingKind).toBe(before!.findingKind);
    expect(after!.severity).toBe(before!.severity);
    expect(after!.fingerprint).toBe(before!.fingerprint);
    expect(afterDetail!.statement.text).toBe(beforeDetail!.statement.text);
  });

  it("keeps a comparison deterministic for identical inputs", async () => {
    const scenario: Scenario = { specLiteral: "24", boqValue: "26", boqNumber: 26, includeBoqQuantity: true };
    const first = await runner({ scenario }).run();
    const second = await runner({ scenario }).run();
    const [left] = await findingsOf(first.harness.store, first.harness.scopeId);
    const [right] = await findingsOf(second.harness.store, second.harness.scopeId);
    expect(right!.fingerprint).toBe(left!.fingerprint);
    expect(right!.evidenceSignature.signatureHash).toBe(left!.evidenceSignature.signatureHash);
    expect(right!.participantIds).toEqual(left!.participantIds);
  });
});
