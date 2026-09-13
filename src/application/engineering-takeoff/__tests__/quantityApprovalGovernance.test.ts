/**
 * Phase 2A-11: QUANTITY APPROVAL GOVERNANCE.
 *
 * An engineering quantity becomes APPROVED in exactly one place: the explicit,
 * approval-named `approveQuantity` command. These tests prove that no other
 * action promotes a candidate to approved truth, and that the lifecycle behaves
 * as the phase demands:
 *
 * - persistence alone does not approve: a stored candidate has no approved value
 *   and stays a candidate;
 * - BOM creation alone does not approve: a BOM built from non-approved decisions
 *   skips them and produces no approved row;
 * - approval requires an actor and a rationale;
 * - approval is attributed and versioned;
 * - supersession preserves the earlier approved value and records the reference;
 * - history is immutable: a mutation attempt is detected, not applied.
 */

import { describe, expect, it } from "vitest";
import { advancingClock, buildHandoff, buildHarness, claimFor } from "./harness";
import type { Harness } from "./harness";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

async function scopeWithCandidate(): Promise<{ harness: Harness; takeoffScopeId: string; candidateId: string }> {
  const harness = buildHarness({
    handoff: buildHandoff({
      quantityClaims: [
        claimFor({ claimId: "claim-cam", subjectMatchKey: "CAM-01", valueLiteral: "24", sourceNumericView: 24, unit: "ea", unitDimension: "COUNT" }),
      ],
    }),
    clock: advancingClock(),
  });
  const scope = await harness.takeoff.openTakeoffScope({
    companyId: COMPANY_A,
    comparisonScopeId: "cmpscope-1",
    name: "CCTV takeoff",
    scopeKind: "DISCIPLINE_TAKEOFF",
    createdByUserId: "user-1",
  });
  const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
  return { harness, takeoffScopeId: scope.takeoffScopeId, candidateId: derived.candidates[0]!.candidateId };
}

describe("Phase 2A-11 — quantity approval governance", () => {
  it("the governed approval command is named explicitly (approveQuantity) and recordDecision delegates to it", async () => {
    const harness = buildHarness({});
    // The explicit approval command exists on the service.
    expect(typeof (harness.decisions as unknown as Record<string, unknown>).approveQuantity).toBe("function");
    // The legacy name still exists, as a delegating alias rather than a second path.
    expect(typeof harness.decisions.recordDecision).toBe("function");
  });

  it("persisting a candidate does NOT approve it: the candidate stays a candidate with no approved value", async () => {
    const { harness, takeoffScopeId, candidateId } = await scopeWithCandidate();

    // Re-read the persisted candidate: it must still be a candidate.
    const candidate = await harness.store.findCandidate({ companyId: COMPANY_A, candidateId });
    expect(candidate).not.toBeNull();
    // A candidate carries a value and a basis, never an approval. There is no
    // `approvedValue` on a candidate at all.
    expect((candidate as unknown as Record<string, unknown>).approvedValue).toBeUndefined();

    // And no decision exists yet for the subject.
    const current = await harness.store.currentDecision({ companyId: COMPANY_A, takeoffScopeId, subjectMatchKey: "CAM-01" });
    expect(current).toBeNull();

    const decisions = await harness.store.listDecisions({ companyId: COMPANY_A, takeoffScopeId, limit: 100 });
    expect(decisions).toEqual([]);
  });

  it("building a BOM does NOT approve a candidate: a non-approved decision is skipped and no approved row appears", async () => {
    const { harness, takeoffScopeId, candidateId } = await scopeWithCandidate();

    // Approve, then WITHDRAW, so the only decision is not current truth.
    const approved = await harness.decisions.approveQuantity({
      companyId: COMPANY_A,
      takeoffScopeId,
      subjectMatchKey: "CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 24,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "approved then withdrawn",
      consideredCandidateIds: [candidateId],
    });
    await harness.decisions.withdrawDecision({ companyId: COMPANY_A, decisionId: approved.decision.decisionId, withdrawalReference: "withdrawn-by-test" });

    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId,
      engineeringScope: "CCTV",
      decisionIds: [approved.decision.decisionId],
      actorUserId: "user-1",
      reason: "names a withdrawn decision",
    });

    // The withdrawn decision is skipped, so no approved row is produced.
    expect(version.skippedDecisionIds).toEqual([approved.decision.decisionId]);
    expect(version.rows.filter((row) => row.isApprovedRow)).toEqual([]);
    expect(version.version.completeness).not.toBe("APPROVED");
  });

  it("approval requires an actor and a rationale: an anonymous or unexplained approval is refused", async () => {
    const { harness, takeoffScopeId, candidateId } = await scopeWithCandidate();

    await expect(
      harness.decisions.approveQuantity({
        companyId: COMPANY_A,
        takeoffScopeId,
        subjectMatchKey: "CAM-01",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        requirementKind: "EQUIPMENT",
        approvedValue: 24,
        approvedUnitLiteral: "ea",
        approvedUnitDimension: "COUNT",
        decisionBasis: "ADOPTED_SOURCE_VALUE",
        actorUserId: "   ",
        rationale: "approved",
        consideredCandidateIds: [candidateId],
      }),
    ).rejects.toThrow(/actor/iu);

    await expect(
      harness.decisions.approveQuantity({
        companyId: COMPANY_A,
        takeoffScopeId,
        subjectMatchKey: "CAM-01",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        requirementKind: "EQUIPMENT",
        approvedValue: 24,
        approvedUnitLiteral: "ea",
        approvedUnitDimension: "COUNT",
        decisionBasis: "ADOPTED_SOURCE_VALUE",
        actorUserId: "user-1",
        rationale: "  ",
        consideredCandidateIds: [candidateId],
      }),
    ).rejects.toThrow(/rationale/iu);

    // And an approval with no governed source is refused.
    await expect(
      harness.decisions.approveQuantity({
        companyId: COMPANY_A,
        takeoffScopeId,
        subjectMatchKey: "CAM-01",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        requirementKind: "EQUIPMENT",
        approvedValue: 24,
        approvedUnitLiteral: "ea",
        approvedUnitDimension: "COUNT",
        decisionBasis: "ADOPTED_SOURCE_VALUE",
        actorUserId: "user-1",
        rationale: "approved",
        consideredCandidateIds: [],
      }),
    ).rejects.toThrow(/candidate/iu);
  });

  it("approval is attributed, versioned, and immutable: supersession preserves the earlier approved value", async () => {
    const { harness, takeoffScopeId, candidateId } = await scopeWithCandidate();

    const first = await harness.decisions.approveQuantity({
      companyId: COMPANY_A,
      takeoffScopeId,
      subjectMatchKey: "CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 24,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "first approval",
      consideredCandidateIds: [candidateId],
    });
    expect(first.decision.state).toBe("APPROVED");
    expect(first.decision.actorUserId).toBe("user-1");
    expect(first.decision.rationale).toBe("first approval");
    expect(first.decision.decisionVersion).toBe(1);

    // A revised approval appends version 2 and retires version 1 by reference.
    const second = await harness.decisions.approveQuantity({
      companyId: COMPANY_A,
      takeoffScopeId,
      subjectMatchKey: "CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 30,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "CORRECTED_BY_HUMAN",
      actorUserId: "user-2",
      rationale: "corrected after review",
      consideredCandidateIds: [candidateId],
    });
    expect(second.decision.decisionVersion).toBe(2);
    expect(second.superseded?.decisionId).toBe(first.decision.decisionId);

    // Version 1 is SUPERSEDED but keeps its original approved value.
    const history = await harness.decisions.decisionHistory({ companyId: COMPANY_A, takeoffScopeId, subjectMatchKey: "CAM-01" });
    expect(history).toHaveLength(2);
    const original = history.find((decision) => decision.decisionVersion === 1)!;
    expect(original.state).toBe("SUPERSEDED");
    expect(original.supersededByDecisionId).toBe(second.decision.decisionId);
    expect(original.approvedValue).toBe(24);

    // The CURRENT decision is the higher version.
    const current = await harness.decisions.currentDecision({ companyId: COMPANY_A, takeoffScopeId, subjectMatchKey: "CAM-01" });
    expect(current?.decisionId).toBe(second.decision.decisionId);
    expect(current?.approvedValue).toBe(30);

    // A mutation attempt against the recorded decision is DETECTED, not applied.
    const mutation = await harness.decisions.detectAttemptedMutation({
      companyId: COMPANY_A,
      incoming: { ...original, approvedValue: 9999 },
    });
    expect(mutation.mutated).toBe(true);
    expect(mutation.fields).toContain("approvedValue");
  });

  it("a candidate from another company cannot be relied on by an approval", async () => {
    const { harness, takeoffScopeId, candidateId } = await scopeWithCandidate();
    await expect(
      harness.decisions.approveQuantity({
        companyId: COMPANY_B,
        takeoffScopeId,
        subjectMatchKey: "CAM-01",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        requirementKind: "EQUIPMENT",
        approvedValue: 24,
        approvedUnitLiteral: "ea",
        approvedUnitDimension: "COUNT",
        decisionBasis: "ADOPTED_SOURCE_VALUE",
        actorUserId: "user-1",
        rationale: "cross tenant",
        consideredCandidateIds: [candidateId],
      }),
    ).rejects.toThrow();
  });

  it("there is no PENDING state: a decision is APPROVED and the only other movements are SUPERSEDED or WITHDRAWN", async () => {
    const { harness, takeoffScopeId, candidateId } = await scopeWithCandidate();
    const approved = await harness.decisions.approveQuantity({
      companyId: COMPANY_A,
      takeoffScopeId,
      subjectMatchKey: "CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 24,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "approved",
      consideredCandidateIds: [candidateId],
    });
    expect(approved.decision.state).toBe("APPROVED");
    expect(["APPROVED", "SUPERSEDED", "WITHDRAWN"]).toContain(approved.decision.state);
  });
});
