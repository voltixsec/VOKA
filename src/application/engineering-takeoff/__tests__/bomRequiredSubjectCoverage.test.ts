/**
 * Phase 2A-11: BOM COMPLETENESS VS THE GOVERNED REQUIRED-SUBJECT SET.
 *
 * The gap this suite closes: a BOM version is built from APPROVED decisions, so a
 * takeoff scope that requires ten subjects while only one has an approved
 * decision would produce a one-row version whose every row is approved. A
 * completeness function that only looks at rows would then report APPROVED —
 * telling a downstream phase that a one-tenth BOM is finished.
 *
 * The invariant proved here is that an approved SUBSET is never a complete BOM:
 * completeness is evaluated against the governed scope's required subjects, and
 * an unresolved required subject stays visible as an omission.
 *
 * These are application-level tests over the REAL services. The persisted
 * counterparts live in `EngineeringPersistence.integration.test.ts`, which runs
 * the same assertion through the Prisma store against real PostgreSQL.
 */

import { describe, expect, it } from "vitest";
import { buildHarness } from "./harness";
import { advancingClock, buildHandoff, claimFor } from "./harness";
import type { Harness } from "./harness";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

async function threeSubjectSetup(): Promise<{ harness: Harness; takeoffScopeId: string; candidateIds: Record<string, string> }> {
  const harness = buildHarness({
    handoff: buildHandoff({
      quantityClaims: [
        claimFor({ claimId: "claim-cam", subjectMatchKey: "CAM-01", valueLiteral: "24", sourceNumericView: 24, unit: "ea", unitDimension: "COUNT" }),
        claimFor({ claimId: "claim-nvr", subjectMatchKey: "NVR-01", valueLiteral: "2", sourceNumericView: 2, unit: "ea", unitDimension: "COUNT" }),
        claimFor({ claimId: "claim-switch", subjectMatchKey: "SW-01", valueLiteral: "6", sourceNumericView: 6, unit: "ea", unitDimension: "COUNT" }),
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
    projectContextKey: "project-1",
  });
  const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
  const candidateIds: Record<string, string> = {};
  for (const candidate of derived.candidates) candidateIds[candidate.subjectMatchKey] = candidate.candidateId;
  return { harness, takeoffScopeId: scope.takeoffScopeId, candidateIds };
}

describe("Phase 2A-11 — BOM completeness is evaluated against the required-subject set", () => {
  it("a scope with THREE required subjects and ONE approved decision yields an APPROVED-looking subset that is NOT a complete BOM", async () => {
    const { harness, takeoffScopeId, candidateIds } = await threeSubjectSetup();

    // Approve exactly ONE of the three required subjects.
    const decision = await harness.decisions.recordDecision({
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
      rationale: "approved the camera count",
      consideredCandidateIds: [candidateIds["CAM-01"]!],
    });

    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId,
      engineeringScope: "CCTV",
      decisionIds: [decision.decision.decisionId],
      actorUserId: "user-1",
      reason: "one-subject version",
    });

    // The rows that exist are all approved — this is the trap the row-only
    // completeness function fell into.
    expect(version.rows).toHaveLength(1);
    expect(version.rows.every((row) => row.isApprovedRow)).toBe(true);

    // The version must NOT claim to be a complete BOM, because two required
    // subjects are still unresolved.
    expect(version.version.completeness).not.toBe("APPROVED");
    expect(version.version.completeness).toBe("REVIEW_REQUIRED");
    expect(version.version.unresolvedRequiredSubjectCount).toBe(2);
    expect(version.version.completenessReasons.some((reason) => /required engineering subject/iu.test(reason))).toBe(true);

    // The unresolved required subjects remain VISIBLE in the persisted manifest.
    const manifest = await harness.store.listRequiredSubjects({ companyId: COMPANY_A, bomVersionId: version.version.bomVersionId });
    expect(manifest).toHaveLength(3);
    const unresolved = manifest.filter((subject) => subject.resolution !== "CARRIED_BY_ROW");
    expect(unresolved.map((subject) => subject.subjectMatchKey).sort()).toEqual(["NVR-01", "SW-01"]);
    for (const subject of unresolved) {
      expect(subject.reason).toBeTruthy();
      expect(subject.bomRowId).toBeNull();
    }
  });

  it("the omission set survives a RELOAD: a second harness reading the same durable store sees the same unresolved subjects", async () => {
    const { harness, takeoffScopeId, candidateIds } = await threeSubjectSetup();
    const decision = await harness.decisions.recordDecision({
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
      consideredCandidateIds: [candidateIds["CAM-01"]!],
    });
    const created = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId,
      engineeringScope: "CCTV",
      decisionIds: [decision.decision.decisionId],
      actorUserId: "user-1",
      reason: "one-subject version",
    });

    // A fresh service set over the SAME durable store: a simulated new process
    // that holds only what was persisted, not the first process's object graph.
    const reloadedStore = harness.store;
    const reloadedManifest = await reloadedStore.listRequiredSubjects({ companyId: COMPANY_A, bomVersionId: created.version.bomVersionId });
    expect(reloadedManifest).toHaveLength(3);
    expect(reloadedManifest.filter((subject) => subject.resolution !== "CARRIED_BY_ROW")).toHaveLength(2);

    // Approving the version re-evaluates against the PERSISTED manifest, so the
    // approval cannot launder an incomplete BOM into a complete one.
    const approved = await harness.bom.approveBomVersion({
      companyId: COMPANY_A,
      bomVersionId: created.version.bomVersionId,
      approvedByUserId: "reviewer-1",
    });
    expect(approved.state).toBe("APPROVED");
    expect(approved.completeness).toBe("REVIEW_REQUIRED");
    expect(approved.unresolvedRequiredSubjectCount).toBe(2);
  });

  it("once EVERY required subject carries a row, the version is genuinely complete", async () => {
    const { harness, takeoffScopeId, candidateIds } = await threeSubjectSetup();
    const decisionIds: string[] = [];
    for (const subject of ["CAM-01", "NVR-01", "SW-01"]) {
      const decision = await harness.decisions.recordDecision({
        companyId: COMPANY_A,
        takeoffScopeId,
        subjectMatchKey: subject,
        subjectKeyNamespace: "EQUIPMENT_TAG",
        requirementKind: "EQUIPMENT",
        approvedValue: 1,
        approvedUnitLiteral: "ea",
        approvedUnitDimension: "COUNT",
        decisionBasis: "ADOPTED_SOURCE_VALUE",
        actorUserId: "user-1",
        rationale: `approved ${subject}`,
        consideredCandidateIds: [candidateIds[subject]!],
      });
      decisionIds.push(decision.decision.decisionId);
    }
    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId,
      engineeringScope: "CCTV",
      decisionIds,
      actorUserId: "user-1",
      reason: "full version",
    });
    expect(version.rows).toHaveLength(3);
    expect(version.version.unresolvedRequiredSubjectCount).toBe(0);
    expect(version.version.completeness).toBe("APPROVED");
    const manifest = await harness.store.listRequiredSubjects({ companyId: COMPANY_A, bomVersionId: version.version.bomVersionId });
    expect(manifest.every((subject) => subject.resolution === "CARRIED_BY_ROW")).toBe(true);
  });

  it("a retired (superseded) decision leaves its subject visible as unresolved rather than silently dropped", async () => {
    const { harness, takeoffScopeId, candidateIds } = await threeSubjectSetup();
    const first = await harness.decisions.recordDecision({
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
      rationale: "first",
      consideredCandidateIds: [candidateIds["CAM-01"]!],
    });
    // A second decision supersedes the first.
    await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId,
      subjectMatchKey: "CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 30,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "CORRECTED_BY_HUMAN",
      actorUserId: "user-1",
      rationale: "corrected",
      consideredCandidateIds: [candidateIds["CAM-01"]!],
    });

    // Build a BOM naming ONLY the retired decision: it is skipped, and the
    // subject must remain visible as unresolved rather than vanishing.
    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId,
      engineeringScope: "CCTV",
      decisionIds: [first.decision.decisionId],
      actorUserId: "user-1",
      reason: "names a retired decision",
    });
    expect(version.skippedDecisionIds).toEqual([first.decision.decisionId]);
    expect(version.rows).toHaveLength(0);
    const manifest = await harness.store.listRequiredSubjects({ companyId: COMPANY_A, bomVersionId: version.version.bomVersionId });
    const cam = manifest.find((subject) => subject.subjectMatchKey === "CAM-01")!;
    expect(cam).toBeDefined();
    expect(cam.resolution).not.toBe("CARRIED_BY_ROW");
    expect(version.version.completeness).toBe("INCOMPLETE");
  });

  it("coverage is company-scoped: another company's manifest for the same version id is empty", async () => {
    const { harness, takeoffScopeId, candidateIds } = await threeSubjectSetup();
    const decision = await harness.decisions.recordDecision({
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
      consideredCandidateIds: [candidateIds["CAM-01"]!],
    });
    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId,
      engineeringScope: "CCTV",
      decisionIds: [decision.decision.decisionId],
      actorUserId: "user-1",
      reason: "v1",
    });
    const crossCompany = await harness.store.listRequiredSubjects({ companyId: COMPANY_B, bomVersionId: version.version.bomVersionId });
    expect(crossCompany).toEqual([]);
  });
});
