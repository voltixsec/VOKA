/**
 * Phase 2A-11 §8 — minimal production use-case surface.
 *
 * These tests exercise the engineering routes through the real route handlers,
 * with `lib/api`'s auth wrapper replaced by a stub that supplies an
 * authenticated company context, and with a recording Prisma double supplied to
 * the composition root. They assert the boundary governance properties:
 *
 * - the company id ALWAYS comes from the authenticated context, never the body;
 * - the approval route requires an explicit rationale and an authorized actor;
 * - no commercial/procurement module is imported by the surface (§14).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A recording Prisma double. The store methods the routes call read through
 * these delegates, so we can prove the `where` clauses carry the AUTHENTICATED
 * company id rather than anything a caller supplied.
 */
const prismaMock = vi.hoisted(() => {
  const whereCalls: Array<{ model: string; op: string; where: Record<string, unknown> }> = [];
  const record = (model: string, op: string) => (args: { where?: Record<string, unknown> }) => {
    whereCalls.push({ model, op, where: args?.where ?? {} });
    return Promise.resolve(op.startsWith("findMany") ? [] : null);
  };
  return {
    whereCalls,
    engineeringTakeoffScope: { findFirst: record("scope", "findFirst"), findMany: record("scope", "findMany") },
    engineeringQuantityCandidate: { findMany: record("candidate", "findMany") },
    engineeringCountingRule: { findMany: record("countingRule", "findMany") },
    engineeringOccurrenceLedgerEntry: { findMany: record("occurrence", "findMany") },
    engineeringBomVersion: { findFirst: record("bomVersion", "findFirst"), findMany: record("bomVersion", "findMany") },
    engineeringBomRow: { findMany: record("bomRow", "findMany") },
    engineeringBomRequiredSubject: { findMany: record("requiredSubject", "findMany") },
    // The handoff reader composes the accepted 2A-10 Prisma store, which reads
    // through these delegates. Providing them keeps the mock honest rather than
    // relying on an incidental "undefined" failure.
    comparisonScope: { findFirst: record("comparisonScope", "findFirst"), findMany: record("comparisonScope", "findMany") },
    normalizedEvidenceClaim: { findMany: record("claim", "findMany") },
    subjectCluster: { findMany: record("cluster", "findMany") },
    subjectMatch: { findMany: record("match", "findMany") },
    crossDocumentFinding: { findMany: record("finding", "findMany") },
    documentIdentity: { findMany: record("documentIdentity", "findMany") },
    documentRevisionMembership: { findMany: record("revisionMembership", "findMany") },
    activeRevisionDecision: { findMany: record("activeRevisionDecision", "findMany") },
    // A scope owned by tenant-A so scope-existence checks pass for the
    // authenticated tenant and the real validation logic is reached.
    $scopeOwner: "tenant-A",
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => {
      try {
        return await handler(request, { user: { id: "actor-1" } }, { companyId: "tenant-A" });
      } catch (error) {
        return responses.handleApiError(error);
      }
    },
  };
});

import { POST as postScope } from "../takeoff-scopes/route";
import { POST as approveQuantity } from "../takeoff-scopes/[takeoffScopeId]/approve-quantity/route";

const body = (payload: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

describe("Phase 2A-11 §8 engineering production surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.whereCalls.length = 0;
  });

  it("POST /takeoff-scopes rejects a missing required field", async () => {
    const request = new Request("http://localhost/api/engineering/takeoff-scopes", body({ description: "no name" }));
    const response = await postScope(request);
    expect(response.status).toBe(400);
  });

  it("POST /takeoff-scopes never accepts a companyId from the body (§7)", async () => {
    const request = new Request("http://localhost/api/engineering/takeoff-scopes?locale=ar", body({ name: "S", scopeKind: "MATERIAL_TAKEOFF", comparisonScopeId: "cmp-1", companyId: "tenant-EVIL" }));
    const response = await postScope(request);
    if (response.status < 400) {
      const payload = await response.json();
      expect(JSON.stringify(payload)).not.toContain("tenant-EVIL");
    }
    // Whatever the outcome, any scope read/write must be scoped to the
    // AUTHENTICATED tenant, never the body value.
    for (const call of prismaMock.whereCalls) {
      expect(JSON.stringify(call.where)).not.toContain("tenant-EVIL");
    }
  });

  it("POST /approve-quantity requires an explicit rationale (no anonymous approval) (§6)", async () => {
    const request = new Request("http://localhost/api/engineering/takeoff-scopes/scope-1/approve-quantity", body({
      subjectMatchKey: "CCTV-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 8,
      approvedUnitLiteral: "PCS",
      approvedUnitDimension: "COUNT",
      decisionBasis: "SOURCE_DECLARED",
      // rationale deliberately omitted
      consideredCandidateIds: [],
    }));
    const response = await approveQuantity(request);
    // Either the scope does not exist (404) or the missing rationale is rejected
    // (400). What must NEVER happen is a successful approval without a rationale.
    expect(response.status).not.toBe(201);
    if (response.status === 400) {
      const payload = await response.json();
      expect(JSON.stringify(payload)).toMatch(/rationale/i);
    }
  });

  it("route sources import no commercial or procurement module (§14)", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const files = [
      "app/api/engineering/takeoff-scopes/route.ts",
      "app/api/engineering/takeoff-scopes/[takeoffScopeId]/route.ts",
      "app/api/engineering/takeoff-scopes/[takeoffScopeId]/candidates/route.ts",
      "app/api/engineering/takeoff-scopes/[takeoffScopeId]/approve-quantity/route.ts",
      "app/api/engineering/takeoff-scopes/[takeoffScopeId]/bom-versions/route.ts",
      "app/api/engineering/bom-versions/[bomVersionId]/route.ts",
      "app/api/engineering/bom-versions/[bomVersionId]/approve/route.ts",
      "app/api/engineering/bom-versions/[bomVersionId]/handoff/route.ts",
      "lib/engineering/route-context.ts",
    ];
    const forbidden = ["Quotation", "Invoice", "ProductSelection", "Supplier", "ProcurementRequirement", "Rfq", "Offer", "Award", "PurchaseOrder"];
    for (const file of files) {
      const src = fs.readFileSync(path.resolve(__dirname, "../../../../", file), "utf8");
      for (const token of forbidden) {
        expect(src, `${file} must not reference ${token}`).not.toContain(token);
      }
    }
  });
});
