/**
 * Phase 2A-11: PERSISTENCE-LAYER TENANT ISOLATION + IDEMPOTENCY CONTRACT.
 *
 * These tests exercise the REAL `PrismaEngineeringStore` — not the in-memory
 * analogue — with the Prisma client replaced by a recording double. They assert
 * the properties that matter at the persistence boundary:
 *
 * - EVERY read carries `companyId` in its `where`. A read that omitted it would
 *   be a cross-tenant leak waiting to happen, so the contract is asserted per
 *   method rather than sampled.
 * - a row returned by the double that belongs to another company is NOT returned
 *   to the caller: the adapter fails closed rather than trusting the database to
 *   have filtered.
 * - every write is company-scoped.
 * - `saveOccurrences` is append-only: a replayed occurrence is reported as
 *   existing rather than rewritten.
 * - a duplicate decision is refused.
 * - creating the same BOM version twice is refused.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** A recording Prisma double: every model records the args it was called with. */
type Call = { model: string; op: string; args: unknown };

const hoisted = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ model: string; op: string; args: unknown }>,
    results: new Map<string, unknown>(),
  };
  const record = (model: string, op: string) => (args: unknown) => {
    state.calls.push({ model, op, args });
    const key = `${model}.${op}`;
    const value = state.results.get(key);
    if (typeof value === "function") return Promise.resolve((value as (args: unknown) => unknown)(args));
    if (value !== undefined) return Promise.resolve(value);
    if (op === "findMany") return Promise.resolve([]);
    if (op === "findFirst" || op === "findUnique") return Promise.resolve(null);
    if (op === "count") return Promise.resolve(0);
    if (op === "createMany") return Promise.resolve({ count: 0 });
    return Promise.resolve({});
  };
  const MODELS = [
    "engineeringTakeoffScope",
    "engineeringCountingRule",
    "engineeringOccurrenceLedgerEntry",
    "engineeringQuantityCandidate",
    "engineeringQuantityCandidateSource",
    "engineeringCandidateConflict",
    "engineeringQuantityDecision",
    "engineeringQuantityDecisionSource",
    "engineeringQuantityDecisionClaim",
    "engineeringCalculation",
    "engineeringCalculationInput",
    "engineeringAdjustment",
    "engineeringBomVersion",
    "engineeringBomVersionDecision",
    "engineeringBomRow",
    "engineeringBomRowConstraint",
    "engineeringBomRowAdjustment",
    "engineeringBomRequiredSubject",
  ];
  const prisma: Record<string, unknown> = {};
  for (const model of MODELS) {
    prisma[model] = {
      findFirst: record(model, "findFirst"),
      findMany: record(model, "findMany"),
      findUnique: record(model, "findUnique"),
      count: record(model, "count"),
      create: record(model, "create"),
      createMany: record(model, "createMany"),
      update: record(model, "update"),
      upsert: record(model, "upsert"),
      deleteMany: record(model, "deleteMany"),
    };
  }
  prisma.$transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { state, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: hoisted.prisma }));

import { PrismaEngineeringStore } from "../PrismaEngineeringStore";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

beforeEach(() => {
  hoisted.state.calls.length = 0;
  hoisted.state.results.clear();
});

/** Every `where` the adapter sent to a model method, flattened. */
function wheres(): Array<Record<string, unknown>> {
  return hoisted.state.calls
    .filter((call) => call.args && typeof call.args === "object" && "where" in (call.args as Record<string, unknown>))
    .map((call) => (call.args as { where: Record<string, unknown> }).where);
}

const calls = hoisted.state.calls;
const results = hoisted.state.results;

describe("Phase 2A-11 — persistence layer enforces company scope on every read", () => {
  const store = new PrismaEngineeringStore();

  it("findScope scopes by company and key", async () => {
    await store.findScope({ companyId: COMPANY_A, takeoffScopeId: "s1" });
    expect(wheres().every((where) => where.companyId === COMPANY_A)).toBe(true);
  });

  it("findCandidate, findDecision, findCalculation, findAdjustment, findBomVersion, findBomRow, findCountingRule all scope by company", async () => {
    await store.findCandidate({ companyId: COMPANY_A, candidateId: "c1" });
    await store.findDecision({ companyId: COMPANY_A, decisionId: "d1" });
    await store.findCalculation({ companyId: COMPANY_A, calculationId: "cal1" });
    await store.findAdjustment({ companyId: COMPANY_A, adjustmentId: "a1" });
    await store.findBomVersion({ companyId: COMPANY_A, bomVersionId: "v1" });
    await store.findBomRow({ companyId: COMPANY_A, bomRowId: "r1" });
    await store.findCountingRule({ companyId: COMPANY_A, takeoffScopeId: "s1", family: "DXF", ruleVersion: "v" });
    const all = wheres();
    expect(all.length).toBeGreaterThanOrEqual(7);
    expect(all.every((where) => where.companyId === COMPANY_A)).toBe(true);
  });

  it("listCandidates, listOccurrences, listDecisions, listBomRows, listRequiredSubjects scope by company", async () => {
    await store.listCandidates({ companyId: COMPANY_A, takeoffScopeId: "s1", limit: 10 });
    await store.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: "s1", limit: 10 });
    await store.listDecisions({ companyId: COMPANY_A, takeoffScopeId: "s1", limit: 10 });
    await store.listBomRows({ companyId: COMPANY_A, bomVersionId: "v1" });
    await store.listRequiredSubjects({ companyId: COMPANY_A, bomVersionId: "v1" });
    const all = wheres();
    expect(all.every((where) => where.companyId === COMPANY_A)).toBe(true);
  });

  it("a row belonging to ANOTHER company is not returned: the adapter fails closed", async () => {
    // The double returns a row whose companyId belongs to B, as a hostile
    // database would if a `where` were ever omitted upstream.
    results.set("engineeringTakeoffScope.findFirst", {
      id: "s1",
      companyId: COMPANY_B,
      name: "foreign",
      description: "",
      scopeKind: "DISCIPLINE_TAKEOFF",
      state: "OPEN",
      comparisonScopeId: "cs",
      comparisonRunId: null,
      evidenceInputDigest: null,
      acceptedClaimCount: 0,
      withheldClaimCount: 0,
      revisionPolicy: "ACTIVE_ONLY",
      readiness: "NOT_READY",
      readinessReasons: [],
      completeness: null,
      blockReasons: [],
      limitations: [],
      createdByUserId: "u",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      scopeVersion: 1,
      supersedesScopeId: null,
      takeoffContractVersion: "2a-11.takeoff.v1",
    });
    const found = await store.findScope({ companyId: COMPANY_A, takeoffScopeId: "s1" });
    // The where clause carried COMPANY_A, so a hostile row is what the double
    // returned — but the store must not silently present another tenant's value.
    expect(found === null || found.companyId === COMPANY_A).toBe(true);
  });
});

describe("Phase 2A-11 — persistence layer enforces company scope on every write", () => {
  const store = new PrismaEngineeringStore();

  it("saveOccurrences writes only rows for the handed companies", async () => {
    await store.saveOccurrences([
      {
        entryId: "occ-1",
        companyId: COMPANY_A,
        takeoffScopeId: "s1",
        countingRuleId: "r1",
        subjectMatchKey: "CAM-01",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        artifactId: "art1",
        derivationFamilyRootArtifactId: "root1",
        evidenceClaimId: null,
        locator: "MODEL_SPACE/handle=1",
        family: "DXF",
        sourceType: "LINE",
        occurrenceClass: "DRAWING_MODEL_ENTITY",
        included: true,
        inclusionReason: null,
        exclusionReason: null,
        note: null,
        countingRuleVersion: "v",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const createMany = calls.find((call) => call.op === "createMany" && call.model === "engineeringOccurrenceLedgerEntry");
    expect(createMany).toBeDefined();
    const data = (createMany!.args as { data: Array<{ companyId: string }> }).data;
    expect(data.every((row) => row.companyId === COMPANY_A)).toBe(true);
  });

  it("retireDecision refuses when the decision is not in the company (fails closed)", async () => {
    // The double reports the decision does not exist for this company.
    results.set("engineeringQuantityDecision.findFirst", null);
    await expect(
      store.retireDecision({ companyId: COMPANY_A, decisionId: "d1", supersededByDecisionId: "d2", state: "SUPERSEDED" }),
    ).rejects.toThrow(/does not exist for this company/u);
    // And it never issued an update.
    expect(calls.some((call) => call.op === "update")).toBe(false);
  });
});

describe("Phase 2A-11 — idempotency and version safety at the persistence layer", () => {
  const store = new PrismaEngineeringStore();

  it("saveOccurrences is append-only: an already-recorded occurrence is reported as existing", async () => {
    results.set("engineeringOccurrenceLedgerEntry.findMany", [{ id: "occ-1", companyId: COMPANY_A }]);
    const result = await store.saveOccurrences([
      {
        entryId: "occ-1",
        companyId: COMPANY_A,
        takeoffScopeId: "s1",
        countingRuleId: "r1",
        subjectMatchKey: "CAM-01",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        artifactId: "art1",
        derivationFamilyRootArtifactId: "root1",
        evidenceClaimId: null,
        locator: "MODEL_SPACE/handle=1",
        family: "DXF",
        sourceType: "LINE",
        occurrenceClass: "DRAWING_MODEL_ENTITY",
        included: true,
        inclusionReason: null,
        exclusionReason: null,
        note: null,
        countingRuleVersion: "v",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(result).toEqual({ inserted: 0, existing: 1 });
    // No create was attempted for the already-recorded occurrence.
    expect(calls.some((call) => call.op === "createMany")).toBe(false);
  });

  it("appendDecision refuses a duplicate decision id", async () => {
    results.set("engineeringQuantityDecision.findFirst", { id: "d1" });
    await expect(
      store.appendDecision({
        decisionId: "d1",
        companyId: COMPANY_A,
        takeoffScopeId: "s1",
        subjectMatchKey: "CAM-01",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        subjectLabel: null,
        requirementKind: "EQUIPMENT",
        decisionVersion: 1,
        approvedValue: 1,
        approvedUnitLiteral: "ea",
        approvedUnitDimension: "COUNT",
        quantityOrigin: "APPROVED_ENGINEERING",
        decisionBasis: "ADOPTED_SOURCE_VALUE",
        actorUserId: "u",
        rationale: "r",
        decidedAt: "2026-01-01T00:00:00.000Z",
        sourceCandidateIds: [],
        sourceClaimIds: [],
        sourceLedgerEntryIds: [],
        sourceCalculationId: null,
        sourceAdjustmentId: null,
        selectedCandidateId: null,
        resolvedConflictSubjectKey: null,
        supersedesDecisionId: null,
        state: "APPROVED",
        supersededByDecisionId: null,
        revisionMembershipIds: [],
        documentIdentityIds: [],
        limitations: [],
        decisionContractVersion: "2a-11.decision.v1",
      }),
    ).rejects.toThrow(/append-only/u);
  });

  it("saveBomVersion refuses to create the same version twice", async () => {
    results.set("engineeringBomVersion.findFirst", { id: "v1", state: "DRAFT" });
    await expect(
      store.saveBomVersion({
        bomVersionId: "v1",
        companyId: COMPANY_A,
        takeoffScopeId: "s1",
        engineeringScope: "CCTV",
        versionNumber: 1,
        previousVersionId: null,
        state: "DRAFT",
        completeness: "INCOMPLETE",
        sourceDecisionIds: [],
        sourceAdjustmentIds: [],
        comparisonScopeId: "cs",
        comparisonRunId: null,
        evidenceInputDigest: null,
        actorUserId: "u",
        reason: "r",
        changeNote: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        approvedByUserId: null,
        approvedAt: null,
        rowCount: 0,
        approvedRowCount: 0,
        reviewRequiredRowCount: 0,
        blockedRowCount: 0,
        unresolvedRequiredSubjectCount: 0,
        completenessReasons: [],
        limitations: [],
        bomContractVersion: "2a-11.bom.v1",
      }),
    ).rejects.toThrow(/already exists/u);
  });

  it("approveBomVersion refuses to re-approve an APPROVED version (immutability)", async () => {
    results.set("engineeringBomVersion.findFirst", { id: "v1", state: "APPROVED" });
    await expect(
      store.approveBomVersion({
        companyId: COMPANY_A,
        bomVersionId: "v1",
        approvedByUserId: "u",
        approvedAt: "2026-01-01T00:00:00.000Z",
        completeness: "APPROVED",
        completenessReasons: [],
      }),
    ).rejects.toThrow(/immutable/u);
  });

  it("saveBomRows refuses to rewrite the rows of an APPROVED version with existing rows", async () => {
    results.set("engineeringBomVersion.findFirst", { id: "v1", state: "APPROVED" });
    // An APPROVED version that ALREADY has rows is immutable: even an empty
    // incoming row set must not be written over it.
    results.set("engineeringBomRow.count", 3);
    await expect(
      store.saveBomRows({ companyId: COMPANY_A, bomVersionId: "v1", rows: [] }),
    ).rejects.toThrow(/immutable/u);

    results.set("engineeringBomRow.count", 3);
    await expect(
      store.saveBomRows({
        companyId: COMPANY_A,
        bomVersionId: "v1",
        rows: [
          {
            rowId: "r1",
            companyId: COMPANY_A,
            bomVersionId: "v1",
            rowKey: "CAM-01",
            position: 1,
            engineeringSubject: "Camera",
            requirementKind: "EQUIPMENT",
            requirementNature: "PHYSICAL_ARTICLE",
            approvedQuantity: 24,
            unitLiteral: "ea",
            unitDimension: "COUNT",
            quantityDecisionId: "d1",
            decisionVersion: 1,
            quantityOrigin: "APPROVED_ENGINEERING",
            adjustmentIds: [],
            adjustmentsSummary: [],
            constraints: [],
            systemContext: null,
            locationContext: null,
            sourceClaimIds: [],
            sourceArtifactIds: [],
            derivationFamilyRootArtifactIds: [],
            occurrenceLedgerEntryIds: [],
            readiness: "APPROVED",
            readinessReasons: [],
            limitations: [],
            isApprovedRow: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ).rejects.toThrow(/immutable/u);

    // A DRAFT version with no rows yet may be written.
    results.set("engineeringBomVersion.findFirst", { id: "v2", state: "DRAFT" });
    results.set("engineeringBomRow.count", 0);
    await expect(
      store.saveBomRows({ companyId: COMPANY_A, bomVersionId: "v2", rows: [] }),
    ).resolves.toBeUndefined();
  });
});
