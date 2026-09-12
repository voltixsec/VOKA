/**
 * Phase 2A-10 hardening: HUMAN REVIEW STATE ISOLATION and STALE-REASON
 * PRECEDENCE.
 *
 * The load-bearing invariant: the comparison engine may change ONLY
 * `reproduced`, `stale`, `staleReason`, and `evidenceChanged`. The human review
 * state belongs exclusively to `FindingReviewService`. So a finding that a
 * reviewer acknowledged stays ACKNOWLEDGED when the finding is reproduced, when
 * its evidence changes, when it goes stale, and when the engine version moves.
 *
 * The stale-reason precedence is
 *
 *   SCOPE_CHANGED > ARTIFACT_BYTES_CHANGED > CLAIMS_SUPERSEDED
 *     > ENGINE_VERSION_CHANGED > NOT_REPRODUCED
 *
 * and the selection is a pure function of a SET: one reason, always the same
 * one, independent of discovery order and of any date.
 */

import { describe, expect, it } from "vitest";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { transitionFindingReview } from "@/src/application/cross-document/FindingReviewService";
import {
  FINDING_PROJECTOR_VERSION,
  STALE_REASON_PRECEDENCE,
  selectStaleReason,
  type StaleReason,
} from "@/src/domain/cross-document";
import { buildHarness, claimFor, makeArtifact, type MaterializationFactory } from "./harness";
import type { CrossDocumentStore } from "@/src/application/cross-document/ports";

const SPEC = makeArtifact({ artifactId: "artifact-spec", kind: "PDF", filename: "spec.pdf" });
const BOQ = makeArtifact({ artifactId: "artifact-boq", kind: "XLSX", filename: "boq.xlsx" });

type Scenario = { specValue: string; boqValue: string; includeBoq: boolean };

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
          valueLiteral: scenario.specValue,
          unit: "nos",
          quantityOrigin: "STATED",
          locator: "p. 3 row 4",
          pageNumber: 3,
        }),
      ]
      : scenario.includeBoq
        ? [
          claimFor({
            artifact,
            lineage,
            predicate: "STATED_QUANTITY",
            subjectKeyNamespace: "EQUIPMENT_TAG",
            subjectKeyValue: "AHU-01",
            subjectMatchKey: "AHU01",
            valueLiteral: scenario.boqValue,
            sourceSuppliedNumber: Number(scenario.boqValue),
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
      materializerVersion: isSpec ? "2a-10.materializer.pdf-native.v1" : "2a-10.materializer.workbook.v1",
      readingChannels: [isSpec ? "PDF_NATIVE_TEXT" : "WORKBOOK_STRUCTURED"],
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

async function build(input: { scenario: Scenario }) {
  const harness = await buildHarness({ artifacts: [SPEC, BOQ], factory: factoryFor(input.scenario) });
  const run = () => runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
  const findings = () => harness.store.listFindings({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 50 });
  return { harness, run, findings };
}

describe("human review state isolation", () => {
  it("keeps ACKNOWLEDGED through reproduction, evidence change, staleness, and an engine-version change", async () => {
    const scenario: Scenario = { specValue: "24", boqValue: "26", includeBoq: true };
    const { harness, run, findings } = await build({ scenario });

    // 1. A finding first appears as OPEN.
    await run();
    const [opened] = await findings();
    expect(opened!.reviewState).toBe("OPEN");
    expect(opened!.engineFlags.reproduced).toBe(true);

    // 2. A human acknowledges it. Only FindingReviewService does this.
    const review = await transitionFindingReview({
      store: harness.store,
      command: { companyId: "company-1", findingId: opened!.findingId, actorUserId: "user-1", toState: "ACKNOWLEDGED", reason: "raised with the consultant", at: "2026-09-12T01:00:00.000Z" },
    });
    expect(review.ok).toBe(true);

    // 3. The same finding is reproduced by an identical run.
    await run();
    let [current] = await findings();
    expect(current!.findingId).toBe(opened!.findingId);
    expect(current!.reviewState).toBe("ACKNOWLEDGED");
    expect(current!.engineFlags.reproduced).toBe(true);
    expect(current!.engineFlags.stale).toBe(false);
    expect(current!.engineFlags.evidenceChanged).toBe(false);

    // 4. The evidence changes.
    scenario.boqValue = "28";
    await run();
    [current] = await findings();
    expect(current!.reviewState).toBe("ACKNOWLEDGED");
    expect(current!.engineFlags.evidenceChanged).toBe(true);
    expect(current!.engineFlags.reproduced).toBe(true);

    // 5. The finding stops reproducing and becomes stale.
    scenario.includeBoq = false;
    await run();
    [current] = await findings();
    expect(current!.reviewState).toBe("ACKNOWLEDGED");
    expect(current!.engineFlags.stale).toBe(true);
    expect(current!.engineFlags.reproduced).toBe(false);
    expect(current!.engineFlags.staleReason).not.toBeNull();

    // 6. The projector/engine version moves under the finding.
    await harness.store.saveFinding({ ...current!, projectorVersion: "2a-10.finding.v0" });
    scenario.includeBoq = true;
    scenario.boqValue = "30";
    await run();
    [current] = await findings();
    expect(current!.reviewState).toBe("ACKNOWLEDGED");
    expect(current!.projectorVersion).toBe(FINDING_PROJECTOR_VERSION);

    // The engine never touched the review lifecycle: exactly one event exists,
    // and it is the human's.
    const events = await harness.store.listReviewEvents({ companyId: "company-1", findingId: current!.findingId, limit: 50 });
    expect(events).toHaveLength(1);
    expect(events[0]!.actorUserId).toBe("user-1");
    expect(events[0]!.toState).toBe("ACKNOWLEDGED");
    expect(events[0]!.explicit).toBe(true);
  });

  it("exposes no engine path to the review state: engine-flag writes leave it untouched", async () => {
    const scenario: Scenario = { specValue: "24", boqValue: "26", includeBoq: true };
    const { harness, run, findings } = await build({ scenario });
    await run();
    const [finding] = await findings();
    await transitionFindingReview({
      store: harness.store,
      command: { companyId: "company-1", findingId: finding!.findingId, actorUserId: "user-1", toState: "NEEDS_INFORMATION", reason: "waiting for the drawing revision", at: "2026-09-12T02:00:00.000Z" },
    });

    // The engine-owned write method carries no review field at all, and applying
    // it cannot move the human state.
    await harness.store.updateFindingEngineFlags({
      companyId: "company-1",
      findingId: finding!.findingId,
      engineFlags: { reproduced: false, stale: true, staleReason: "CLAIMS_SUPERSEDED", evidenceChanged: true, lastReproducedRunId: null, lastReproducedAt: null },
      evidenceSignature: finding!.evidenceSignature,
      comparisonRunId: "run_engine_only",
      projectorVersion: FINDING_PROJECTOR_VERSION,
      updatedAt: "2026-09-12T03:00:00.000Z",
    });
    const after = await harness.store.findFinding({ companyId: "company-1", findingId: finding!.findingId });
    expect(after!.reviewState).toBe("NEEDS_INFORMATION");
    expect(after!.engineFlags.stale).toBe(true);

    // Only the audited human command can move it, and it appends an event.
    const reopened = await transitionFindingReview({
      store: harness.store,
      command: { companyId: "company-1", findingId: finding!.findingId, actorUserId: "user-2", toState: "ACKNOWLEDGED", reason: "revision received", at: "2026-09-12T04:00:00.000Z" },
    });
    expect(reopened.ok).toBe(true);
    const final = await harness.store.findFinding({ companyId: "company-1", findingId: finding!.findingId });
    expect(final!.reviewState).toBe("ACKNOWLEDGED");
    expect(await harness.store.listReviewEvents({ companyId: "company-1", findingId: finding!.findingId, limit: 50 })).toHaveLength(2);
  });
});

describe("stale reason precedence", () => {
  it("returns exactly one reason when exactly one is observed", () => {
    expect(selectStaleReason({ observed: ["SCOPE_CHANGED"], projectorVersionChanged: false })).toBe("SCOPE_CHANGED");
    expect(selectStaleReason({ observed: ["ARTIFACT_BYTES_CHANGED"], projectorVersionChanged: false })).toBe("ARTIFACT_BYTES_CHANGED");
    expect(selectStaleReason({ observed: ["CLAIMS_SUPERSEDED"], projectorVersionChanged: false })).toBe("CLAIMS_SUPERSEDED");
    expect(selectStaleReason({ observed: [], projectorVersionChanged: true })).toBe("ENGINE_VERSION_CHANGED");
    expect(selectStaleReason({ observed: [], projectorVersionChanged: false })).toBe("NOT_REPRODUCED");
  });

  it("picks the stronger reason when two are observed, in either discovery order", () => {
    const pairs: Array<[StaleReason, StaleReason]> = [
      ["SCOPE_CHANGED", "ARTIFACT_BYTES_CHANGED"],
      ["SCOPE_CHANGED", "CLAIMS_SUPERSEDED"],
      ["SCOPE_CHANGED", "NOT_REPRODUCED"],
      ["ARTIFACT_BYTES_CHANGED", "CLAIMS_SUPERSEDED"],
      ["ARTIFACT_BYTES_CHANGED", "NOT_REPRODUCED"],
      ["CLAIMS_SUPERSEDED", "NOT_REPRODUCED"],
    ];
    for (const [left, right] of pairs) {
      const expected = STALE_REASON_PRECEDENCE.find((reason) => reason === left || reason === right)!;
      expect(selectStaleReason({ observed: [left, right], projectorVersionChanged: false })).toBe(expected);
      // Order-independent: the same pair in the other order gives the same reason.
      expect(selectStaleReason({ observed: [right, left], projectorVersionChanged: false })).toBe(expected);
      // Duplicates change nothing.
      expect(selectStaleReason({ observed: [left, left, right], projectorVersionChanged: false })).toBe(expected);
    }
  });

  it("picks the strongest reason when three are observed, in any order", () => {
    const triple: StaleReason[] = ["NOT_REPRODUCED", "CLAIMS_SUPERSEDED", "ARTIFACT_BYTES_CHANGED"];
    const permutations: StaleReason[][] = [
      triple,
      [triple[2]!, triple[1]!, triple[0]!],
      [triple[1]!, triple[0]!, triple[2]!],
      [triple[2]!, triple[0]!, triple[1]!],
      [triple[0]!, triple[2]!, triple[1]!],
      [triple[1]!, triple[2]!, triple[0]!],
    ];
    for (const observed of permutations) {
      expect(selectStaleReason({ observed, projectorVersionChanged: true })).toBe("ARTIFACT_BYTES_CHANGED");
    }
    // With the byte change removed, the next strongest reason wins, still
    // regardless of order.
    const withoutBytes: StaleReason[] = ["NOT_REPRODUCED", "CLAIMS_SUPERSEDED"];
    expect(selectStaleReason({ observed: withoutBytes, projectorVersionChanged: true })).toBe("CLAIMS_SUPERSEDED");
    expect(selectStaleReason({ observed: [...withoutBytes].reverse(), projectorVersionChanged: true })).toBe("CLAIMS_SUPERSEDED");
    expect(selectStaleReason({ observed: ["NOT_REPRODUCED"], projectorVersionChanged: true })).toBe("ENGINE_VERSION_CHANGED");
  });

  it("declares the mandated precedence order exactly", () => {
    expect([...STALE_REASON_PRECEDENCE]).toEqual([
      "SCOPE_CHANGED",
      "ARTIFACT_BYTES_CHANGED",
      "CLAIMS_SUPERSEDED",
      "ENGINE_VERSION_CHANGED",
      "NOT_REPRODUCED",
    ]);
  });

  it("never mutates review state while a finding goes stale in a real run", async () => {
    const scenario: Scenario = { specValue: "24", boqValue: "26", includeBoq: true };
    const { harness, run, findings } = await build({ scenario });
    await run();
    const [finding] = await findings();
    await transitionFindingReview({
      store: harness.store,
      command: { companyId: "company-1", findingId: finding!.findingId, actorUserId: "user-1", toState: "ACKNOWLEDGED", reason: "ack", at: "2026-09-12T05:00:00.000Z" },
    });
    scenario.includeBoq = false;
    await run();
    const [stale] = await findings();
    expect(stale!.engineFlags.stale).toBe(true);
    expect(stale!.engineFlags.staleReason).toBe("CLAIMS_SUPERSEDED");
    expect(stale!.reviewState).toBe("ACKNOWLEDGED");
  });
});

describe("engine-flag writes are company-scoped", () => {
  it("does not apply an engine-flag write for another company's finding", async () => {
    const scenario: Scenario = { specValue: "24", boqValue: "26", includeBoq: true };
    const { run, findings, harness } = await build({ scenario });
    await run();
    const [finding] = await findings();
    await harness.store.updateFindingEngineFlags({
      companyId: "company-other",
      findingId: finding!.findingId,
      engineFlags: { reproduced: false, stale: true, staleReason: "SCOPE_CHANGED", evidenceChanged: false, lastReproducedRunId: null, lastReproducedAt: null },
      evidenceSignature: finding!.evidenceSignature,
      comparisonRunId: "run_cross_tenant",
      projectorVersion: FINDING_PROJECTOR_VERSION,
      updatedAt: "2026-09-12T06:00:00.000Z",
    });
    const after = await harness.store.findFinding({ companyId: "company-1", findingId: finding!.findingId });
    expect(after!.engineFlags.stale).toBe(false);
    expect(after!.engineFlags.reproduced).toBe(true);
    expect(await harness.store.findFinding({ companyId: "company-other", findingId: finding!.findingId })).toBeNull();
  });
});

export type { CrossDocumentStore };
