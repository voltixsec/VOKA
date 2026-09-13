/**
 * Phase 2A-11: PERSISTED engineering persistence integration (real PostgreSQL).
 *
 * This is the test the Phase 2A-11 acceptance criteria actually require: the real
 * `PrismaEngineeringStore` against a real PostgreSQL database, driven through the
 * real application services, proving that engineering truth survives a process
 * boundary and that tenant isolation is enforced at the persistence layer.
 *
 * It is OPT-IN, because a real database is a real external dependency and a
 * suite that silently skipped itself while claiming to have verified persistence
 * would be dishonest. Run it with:
 *
 *   VOKA_ENGINEERING_PG_TESTS=1 npx vitest run src/infrastructure/engineering-takeoff/__tests__/EngineeringPersistence.integration.test.ts
 *
 * When the flag is absent the suite reports as SKIPPED. That is visible in the
 * test output, so the distinction between "verified" and "not run" is never
 * blurred. The environment must already have the Phase 2A-11 migration applied.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { EngineeringTakeoffScope } from "@/src/domain/engineering-takeoff";

const ENABLED = process.env.VOKA_ENGINEERING_PG_TESTS === "1";

const COMPANY_A = "c-persist-a";
const COMPANY_B = "c-persist-b";
const NOW = "2026-09-13T00:00:00.000Z";

describe.skipIf(!ENABLED)("Phase 2A-11 persisted engineering persistence (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let PrismaEngineeringStore: typeof import("../PrismaEngineeringStore").PrismaEngineeringStore;
  let store: InstanceType<typeof PrismaEngineeringStore>;

  beforeAll(async () => {
    ({ prisma } = (await import("@/lib/prisma")) as unknown as { prisma: PrismaClient });
    ({ PrismaEngineeringStore } = await import("../PrismaEngineeringStore"));
    store = new PrismaEngineeringStore();

    // Every company-owned engineering record has a `companyId` FK to `Company`,
    // so the synthetic tenants this suite uses must exist before any scope,
    // decision, or BOM row can be written.
    for (const companyId of [COMPANY_A, COMPANY_B]) {
      await prisma.company.upsert({
        where: { id: companyId },
        update: {},
        create: { id: companyId, slug: companyId, name: companyId, defaultCurrency: "KWD" },
      });
    }
  });

  afterAll(async () => {
    if (!ENABLED) return;
    // Clean up only the rows this suite created, scoped to its own synthetic
    // companies, so a shared database is left as it was found. Engineering rows
    // cascade from Company, so removing the tenants removes their records.
    for (const companyId of [COMPANY_A, COMPANY_B]) {
      await prisma.engineeringTakeoffScope.deleteMany({ where: { companyId } });
    }
    await prisma.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.$disconnect();
  });

  function scopeFixture(overrides: Partial<EngineeringTakeoffScope> = {}): EngineeringTakeoffScope {
    return {
      takeoffScopeId: "ets-persist-1",
      companyId: COMPANY_A,
      projectContextKey: "project-1",
      name: "CCTV takeoff",
      description: "",
      scopeKind: "DISCIPLINE_TAKEOFF",
      state: "OPEN",
      comparisonScopeId: "cmpscope-1",
      comparisonRunId: "cmprun-1",
      evidenceInputDigest: "digest-1",
      acceptedClaimCount: 5,
      withheldClaimCount: 1,
      revisionPolicy: "ACTIVE_ONLY",
      readiness: "READY_FOR_DECISION",
      readinessReasons: [],
      completeness: null,
      blockReasons: [],
      limitations: [],
      createdByUserId: "user-1",
      createdAt: NOW,
      updatedAt: NOW,
      scopeVersion: 1,
      supersedesScopeId: null,
      takeoffContractVersion: "2a-11.takeoff.v1",
      ...overrides,
    };
  }

  it("persists a scope and reads it back through a NEW store instance", async () => {
    await new PrismaEngineeringStore().saveScope(scopeFixture());

    // A BRAND NEW store instance — a simulated process/machine boundary.
    const reloaded = await new PrismaEngineeringStore().findScope({ companyId: COMPANY_A, takeoffScopeId: "ets-persist-1" });
    expect(reloaded).not.toBeNull();
    expect(reloaded!.acceptedClaimCount).toBe(5);
    expect(reloaded!.name).toBe("CCTV takeoff");
    expect(reloaded!.evidenceInputDigest).toBe("digest-1");
  });

  it("fails closed on a cross-company read of a persisted scope", async () => {
    const crossingRead = await store.findScope({ companyId: COMPANY_B, takeoffScopeId: "ets-persist-1" });
    expect(crossingRead).toBeNull();
  });

  it("refuses to retire a decision that is not in this company", async () => {
    await expect(
      store.retireDecision({ companyId: COMPANY_B, decisionId: "eqd-does-not-exist", supersededByDecisionId: "x", state: "SUPERSEDED" }),
    ).rejects.toThrow();
  });

  it("scopes listScopes strictly to the requested company", async () => {
    const companyARows = await store.listScopes({ companyId: COMPANY_A, limit: 100 });
    expect(companyARows.every((scope) => scope.companyId === COMPANY_A)).toBe(true);
    const companyBRows = await store.listScopes({ companyId: COMPANY_B, limit: 100 });
    expect(companyBRows).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // §12 occurrence dedup / append-only, at the persistence layer
  // -------------------------------------------------------------------------

  it("the occurrence ledger is append-only: a re-appended occurrence is reported as existing and never rewritten", async () => {
    const { PrismaEngineeringStore } = await import("../PrismaEngineeringStore");
    const ledgerStore = new PrismaEngineeringStore();
    // A scope + counting rule are required parents for a ledger entry.
    await ledgerStore.saveScope(scopeFixture({ takeoffScopeId: "ets-ledger-1", comparisonScopeId: "cmpscope-ledger" }));
    const rule = {
      ruleId: "ecr-ledger-1",
      ruleVersion: "2a-11.counting.v1/dxf",
      family: "DXF" as const,
      description: "dxf countable entities",
      admittedEntityTypes: ["LINE"],
      modelSpaceOnly: false,
      requiresSubjectIdentity: false,
      createdAt: NOW,
      companyId: COMPANY_A,
      takeoffScopeId: "ets-ledger-1",
    };
    await ledgerStore.saveCountingRule(rule);

    const entry = {
      entryId: "occ-ledger-1",
      companyId: COMPANY_A,
      takeoffScopeId: "ets-ledger-1",
      countingRuleId: "ecr-ledger-1",
      subjectMatchKey: "CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      artifactId: "artifact-1",
      derivationFamilyRootArtifactId: "artifact-root-1",
      evidenceClaimId: null,
      locator: "MODEL_SPACE/handle=1A2B",
      family: "DXF" as const,
      sourceType: "LINE",
      occurrenceClass: "DRAWING_MODEL_ENTITY" as const,
      included: true,
      inclusionReason: null,
      exclusionReason: null,
      note: null,
      countingRuleVersion: "2a-11.counting.v1/dxf",
      createdAt: NOW,
    };

    const first = await ledgerStore.saveOccurrences([entry]);
    expect(first).toEqual({ inserted: 1, existing: 0 });

    // Re-appending the SAME occurrence id is reported as existing, not re-inserted.
    const second = await ledgerStore.saveOccurrences([{ ...entry, included: false, exclusionReason: "REVIEW_EXCLUDED" as never }]);
    expect(second).toEqual({ inserted: 0, existing: 1 });

    // The original inclusion decision is preserved, not overwritten by the replay.
    const persisted = await ledgerStore.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: "ets-ledger-1", limit: 10 });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.included).toBe(true);
  });

  it("three DISTINCT occurrences in one artifact persist as three rows", async () => {
    const { PrismaEngineeringStore } = await import("../PrismaEngineeringStore");
    const ledgerStore = new PrismaEngineeringStore();
    const distinct = ["h1", "h2", "h3"].map((handle, index) => ({
      entryId: `occ-distinct-${index}`,
      companyId: COMPANY_A,
      takeoffScopeId: "ets-ledger-1",
      countingRuleId: "ecr-ledger-1",
      subjectMatchKey: "CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      artifactId: "artifact-1",
      derivationFamilyRootArtifactId: "artifact-root-1",
      evidenceClaimId: null,
      locator: `MODEL_SPACE/handle=${handle}`,
      family: "DXF" as const,
      sourceType: "LINE",
      occurrenceClass: "DRAWING_MODEL_ENTITY" as const,
      included: true,
      inclusionReason: null,
      exclusionReason: null,
      note: null,
      countingRuleVersion: "2a-11.counting.v1/dxf",
      createdAt: NOW,
    }));
    const result = await ledgerStore.saveOccurrences(distinct);
    expect(result.inserted).toBe(3);
    const count = await ledgerStore.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: "ets-ledger-1", included: true });
    expect(count).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // §13 idempotency / version safety, at the persistence layer
  // -------------------------------------------------------------------------

  it("a decision is append-only: appending the same decision twice is refused", async () => {
    const { PrismaEngineeringStore } = await import("../PrismaEngineeringStore");
    const decisionStore = new PrismaEngineeringStore();
    await decisionStore.saveScope(scopeFixture({ takeoffScopeId: "ets-decision-1", comparisonScopeId: "cmpscope-d" }));
    // The decision actor must be a real user in this environment; if the FK is
    // enforced the insert fails for that reason too, which is itself a truthful
    // refusal. We create the user when possible.
    const userId = "user-persist-1";
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: "persist@voka.test", name: "Persist User" },
      update: {},
    });
    const decision: import("@/src/domain/engineering-takeoff").EngineeringQuantityDecision = {
      decisionId: "eqd-persist-1",
      companyId: COMPANY_A,
      takeoffScopeId: "ets-decision-1",
      subjectMatchKey: "CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      subjectLabel: "Camera",
      requirementKind: "EQUIPMENT",
      decisionVersion: 1,
      approvedValue: 24,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      quantityOrigin: "APPROVED_ENGINEERING",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: userId,
      rationale: "approved",
      decidedAt: NOW,
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
    };
    await decisionStore.appendDecision(decision);
    await expect(decisionStore.appendDecision(decision)).rejects.toThrow(/append-only/u);
  });

  it("retiring a decision writes only state and never changes the approved value", async () => {
    const { PrismaEngineeringStore } = await import("../PrismaEngineeringStore");
    const decisionStore = new PrismaEngineeringStore();
    const before = await decisionStore.findDecision({ companyId: COMPANY_A, decisionId: "eqd-persist-1" });
    expect(before).not.toBeNull();
    const approvedValueBefore = before!.approvedValue;

    await decisionStore.retireDecision({ companyId: COMPANY_A, decisionId: "eqd-persist-1", supersededByDecisionId: "eqd-persist-2", state: "SUPERSEDED" });
    const after = await decisionStore.findDecision({ companyId: COMPANY_A, decisionId: "eqd-persist-1" });
    expect(after!.state).toBe("SUPERSEDED");
    expect(after!.supersededByDecisionId).toBe("eqd-persist-2");
    // The approved value is immutable through retirement.
    expect(after!.approvedValue).toBe(approvedValueBefore);
  });
});
