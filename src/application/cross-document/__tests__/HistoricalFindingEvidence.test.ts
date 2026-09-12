/**
 * Phase 2A-10 hardening: HISTORICAL FINDING EVIDENCE must stay reconstructible.
 *
 * The mandate scenario:
 *
 *   Run 1: BOQ = 24, IFC = 22
 *   Run 2: BOQ = 24, IFC = 23
 *
 * Run 2 must leave the SAME logical finding identity with a DIFFERENT evidence
 * signature, the current projection must read 24 vs 23, and Run 1 must still be
 * reconstructible — with its old immutable claim ids, its exact old locators,
 * its exact old literals, and its participant/finding/run association.
 *
 * A hash-only signature history would not satisfy this, and neither does the
 * current-projection participant set: `FindingParticipant` rows are replaced on
 * every run (deliberately, so a two-source disagreement never renders as three
 * sides), and `CrossDocumentFinding.evidenceSignature` is overwritten. What
 * makes Run 1 survive is the durable run/finding-evidence association:
 * one `FindingEvidenceObservation` per (finding, run), each pointing at the
 * IMMUTABLE claims it rested on.
 *
 * These tests drive the REAL engine and read the history back through the REAL
 * read model after the second run has already replaced the current projection.
 */

import { describe, expect, it } from "vitest";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { getFindingDetail, listFindingEvidenceHistory } from "@/src/application/cross-document/ReadModels";
import { transitionFindingReview } from "@/src/application/cross-document/FindingReviewService";
import { buildHarness, claimFor, makeArtifact, type MaterializationFactory } from "./harness";
import type { CrossDocumentStore } from "@/src/application/cross-document/ports";

const BOQ = makeArtifact({ artifactId: "artifact-boq", kind: "XLSX", filename: "boq.xlsx" });
const MODEL = makeArtifact({ artifactId: "artifact-ifc", kind: "IFC", filename: "model.ifc" });

type Scenario = { boqValue: string; modelValue: number };

/** BOQ states a workbook-supplied quantity; the IFC declares model evidence. */
function factoryFor(scenario: Scenario): MaterializationFactory {
  return ({ artifact, lineage }) => {
    const isBoq = artifact.artifactId === BOQ.artifactId;
    const claims = [
      claimFor({
        artifact,
        lineage,
        predicate: "STATED_QUANTITY",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        subjectKeyValue: "AHU-01",
        subjectMatchKey: "AHU01",
        valueLiteral: isBoq ? scenario.boqValue : String(scenario.modelValue),
        sourceSuppliedNumber: isBoq ? Number(scenario.boqValue) : scenario.modelValue,
        unit: "nos",
        quantityOrigin: isBoq ? "STATED" : "DECLARED_MODEL",
        // The locator differs per side so the historical locator is provable.
        locator: isBoq ? "row 12 column D" : "#412 IfcQuantityCount",
        pageNumber: isBoq ? null : null,
        readingChannel: isBoq ? "WORKBOOK_STRUCTURED" : "IFC_MODEL",
        materializerVersion: isBoq ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.ifc.v1",
      }),
    ];
    return {
      artifact,
      lineage,
      materializationId: `mat_${artifact.artifactId}`,
      materializerVersion: isBoq ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.ifc.v1",
      readingChannels: [isBoq ? "WORKBOOK_STRUCTURED" : "IFC_MODEL"],
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

async function findingsOf(store: CrossDocumentStore, scopeId: string) {
  return store.listFindings({ companyId: "company-1", comparisonScopeId: scopeId, limit: 50 });
}

describe("historical finding evidence", () => {
  it("keeps Run 1 (24 vs 22) reconstructible after Run 2 (24 vs 23) replaces the current projection", async () => {
    const scenario: Scenario = { boqValue: "24", modelValue: 22 };
    const harness = await buildHarness({ artifacts: [BOQ, MODEL], factory: factoryFor(scenario) });

    // --- Run 1 -------------------------------------------------------------
    const first = await runCrossDocumentComparison({
      companyId: "company-1",
      comparisonScopeId: harness.scopeId,
      actorUserId: "user-1",
      dependencies: harness.dependencies,
    });
    expect(first.newFindingCount).toBe(1);
    const [runOneFinding] = await findingsOf(harness.store, harness.scopeId);
    const runOneSignature = runOneFinding!.evidenceSignature.signatureHash;
    const runOneRunId = first.comparisonRunId;

    // --- Run 2: the model was re-issued and now declares 23 -----------------
    scenario.modelValue = 23;
    const second = await runCrossDocumentComparison({
      companyId: "company-1",
      comparisonScopeId: harness.scopeId,
      actorUserId: "user-1",
      dependencies: harness.dependencies,
    });
    expect(second.newFindingCount).toBe(0);
    expect(second.reproducedFindingCount).toBe(1);

    // --- Reloaded current projection ---------------------------------------
    const reloaded = await findingsOf(harness.store, harness.scopeId);
    expect(reloaded).toHaveLength(1);
    // SAME logical finding identity.
    expect(reloaded[0]!.findingId).toBe(runOneFinding!.findingId);
    expect(reloaded[0]!.fingerprint).toBe(runOneFinding!.fingerprint);
    // DIFFERENT evidence signature, and the engine says the evidence changed.
    expect(reloaded[0]!.evidenceSignature.signatureHash).not.toBe(runOneSignature);
    expect(reloaded[0]!.engineFlags.evidenceChanged).toBe(true);
    expect(reloaded[0]!.engineFlags.reproduced).toBe(true);
    expect(reloaded[0]!.engineFlags.stale).toBe(false);

    // The current projection reads 24 vs 23 — never three sides.
    const currentDetail = await getFindingDetail({ companyId: "company-1", store: harness.store, locale: "en", findingId: reloaded[0]!.findingId });
    expect(currentDetail!.participants).toHaveLength(2);
    expect(currentDetail!.participants.map((participant) => participant.verbatimValue).sort()).toEqual(["23", "24"]);
    const currentModelClaim = currentDetail!.participants.find((participant) => participant.sourceArtifactId === MODEL.artifactId)!;
    expect(currentModelClaim.verbatimValue).toBe("23");

    // --- Historical Run 1, read back from durable persistence ---------------
    const history = await listFindingEvidenceHistory({ companyId: "company-1", store: harness.store, locale: "en", findingId: reloaded[0]!.findingId });
    expect(history).toHaveLength(2);

    const runOne = history.find((observation) => observation.comparisonRunId === runOneRunId)!;
    const runTwo = history.find((observation) => observation.comparisonRunId === second.comparisonRunId)!;
    expect(runOne).toBeDefined();
    expect(runTwo).toBeDefined();

    // Run 1's observation is bound to the same finding and its own run.
    expect(runOne.fingerprint).toBe(runOneFinding!.fingerprint);
    expect(runOne.evidenceSignatureHash).toBe(runOneSignature);
    // Run 2's evidence genuinely differed from Run 1's.
    expect(runTwo.evidenceChanged).toBe(true);
    expect(runTwo.evidenceSignatureHash).not.toBe(runOne.evidenceSignatureHash);

    // Run 1 still reads back as 24 vs 22, with exact old literals ...
    expect(runOne.entries.map((entry) => entry.valueLiteral).sort()).toEqual(["22", "24"]);
    const historicalModel = runOne.entries.find((entry) => entry.sourceArtifactId === MODEL.artifactId)!;
    const historicalBoq = runOne.entries.find((entry) => entry.sourceArtifactId === BOQ.artifactId)!;
    expect(historicalModel.valueLiteral).toBe("22");
    expect(historicalBoq.valueLiteral).toBe("24");
    // ... exact old locators ...
    expect(historicalModel.locator).toBe("#412 IfcQuantityCount");
    expect(historicalBoq.locator).toBe("row 12 column D");
    // ... and the OLD immutable claim id, which is not the current one.
    expect(historicalModel.claimId).not.toBe(currentModelClaim.claimId);
    expect(historicalModel.claimMissing).toBe(false);
    expect(runOne.entries.every((entry) => entry.claimId.startsWith("clm_"))).toBe(true);

    // The old claims are still individually readable and were never rewritten.
    const oldClaim = await harness.store.findClaim({ companyId: "company-1", claimId: historicalModel.claimId });
    expect(oldClaim).not.toBeNull();
    expect(oldClaim!.assertion.valueLiteral).toBe("22");
    expect(oldClaim!.assertion.valueNumber).toBe(22);
    expect(oldClaim!.assertion.quantityOrigin).toBe("DECLARED_MODEL");
    expect(oldClaim!.provenance.locator).toBe("#412 IfcQuantityCount");
    expect(oldClaim!.status).toBe("OBSERVED_NOT_APPROVED");

    // Stable display ordinals are preserved, and history is ordered oldest first.
    expect(runOne.entries.map((entry) => entry.ordinal)).toEqual([1, 2]);
    expect(history[0]!.comparisonRunId).toBe(runOneRunId);
    expect(history[1]!.comparisonRunId).toBe(second.comparisonRunId);
  });

  it("does not rewrite an observation when the same run id is recorded twice, and keeps history append-only", async () => {
    const scenario: Scenario = { boqValue: "24", modelValue: 22 };
    const harness = await buildHarness({ artifacts: [BOQ, MODEL], factory: factoryFor(scenario) });
    const first = await runCrossDocumentComparison({
      companyId: "company-1",
      comparisonScopeId: harness.scopeId,
      actorUserId: "user-1",
      dependencies: harness.dependencies,
    });
    const [finding] = await findingsOf(harness.store, harness.scopeId);
    const before = await harness.store.listFindingEvidenceObservations({ companyId: "company-1", findingId: finding!.findingId, limit: 50 });
    expect(before).toHaveLength(1);

    // A duplicate write for the same (finding, run) collides with itself.
    await harness.store.saveFindingEvidenceObservation({
      record: { ...before[0]!, evidenceSignatureHash: "tampered", evidenceChanged: true },
      entries: [{
        observationId: before[0]!.observationId,
        companyId: "company-1",
        findingId: before[0]!.findingId,
        comparisonRunId: before[0]!.comparisonRunId,
        claimId: "clm_forged",
        ordinal: 9,
      }],
    });
    const after = await harness.store.listFindingEvidenceObservations({ companyId: "company-1", findingId: finding!.findingId, limit: 50 });
    expect(after).toHaveLength(1);
    expect(after[0]!.evidenceSignatureHash).toBe(before[0]!.evidenceSignatureHash);
    expect(after[0]!.evidenceSignatureHash).not.toBe("tampered");
    expect(after[0]!.entries.map((entry) => entry.claimId)).toEqual(before[0]!.entries.map((entry) => entry.claimId));
    expect(first.comparisonRunId).toBeTruthy();
  });

  it("keeps a human review decision intact across an evidence change, so history and review agree", async () => {
    const scenario: Scenario = { boqValue: "24", modelValue: 22 };
    const harness = await buildHarness({ artifacts: [BOQ, MODEL], factory: factoryFor(scenario) });
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
    const [finding] = await findingsOf(harness.store, harness.scopeId);
    const review = await transitionFindingReview({
      store: harness.store,
      command: { companyId: "company-1", findingId: finding!.findingId, actorUserId: "user-1", toState: "ACKNOWLEDGED", reason: "raised with the model author", at: "2026-09-12T02:00:00.000Z" },
    });
    expect(review.ok).toBe(true);

    scenario.modelValue = 23;
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });

    const [reloaded] = await findingsOf(harness.store, harness.scopeId);
    expect(reloaded!.reviewState).toBe("ACKNOWLEDGED");
    expect(reloaded!.engineFlags.evidenceChanged).toBe(true);
    const history = await listFindingEvidenceHistory({ companyId: "company-1", store: harness.store, locale: "ar", findingId: reloaded!.findingId });
    expect(history).toHaveLength(2);
    expect(history[0]!.entries.map((entry) => entry.valueLiteral).sort()).toEqual(["22", "24"]);
  });
});
