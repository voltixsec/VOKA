import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/engineering/route-context";
import { EngineeringDecisionService, EngineeringTakeoffService } from "@/src/application/engineering-takeoff";

/**
 * POST /api/engineering/takeoff-scopes/<takeoffScopeId>/approve-quantity
 *
 * THE governed quantity approval action (§6). It is named for what it does:
 * it APPROVES a quantity. There is no generic "record" route here that could
 * accidentally approve a candidate as a side effect.
 *
 * Required, none of which may be omitted or inferred:
 *   - an authorized human actor (from the authenticated session),
 *   - a rationale,
 *   - the candidate(s) considered.
 *
 * The quantity is never derived from a body value the caller can invent into
 * approval: the service only accepts a decision over candidates that actually
 * exist in this company's scope. No commercial, pricing, or procurement field
 * is accepted or produced.
 */

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "ENGINEERING_BODY_INVALID", "A JSON body is required.");
  }
}

function requiredString(payload: Record<string, unknown>, key: string, code: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, code, `${key} is required.`);
  }
  return value.trim();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const takeoffScopeId = pathSegment(request, 1);
  if (!takeoffScopeId) throw new ApiError(400, "ENGINEERING_SCOPE_REQUIRED", "A takeoff scope id is required.");
  const payload = await body(request);
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const { store, handoffReader, occurrenceSource, clock } = context.dependencies;

  const takeoff = new EngineeringTakeoffService({ store, handoffReader, occurrenceSource, clock });
  const scope = await takeoff.findScope({ companyId: context.companyId, takeoffScopeId });
  if (!scope) throw new ApiError(404, "ENGINEERING_SCOPE_NOT_FOUND", "No such takeoff scope for this company.");

  const approvedValue = Number(payload.approvedValue);
  if (!Number.isFinite(approvedValue)) {
    throw new ApiError(400, "ENGINEERING_APPROVED_VALUE_REQUIRED", "A finite approved value is required.");
  }

  const service = new EngineeringDecisionService({ store, clock });
  const result = await service.approveQuantity({
    companyId: context.companyId,
    takeoffScopeId,
    subjectMatchKey: requiredString(payload, "subjectMatchKey", "ENGINEERING_SUBJECT_REQUIRED"),
    subjectKeyNamespace: requiredString(payload, "subjectKeyNamespace", "ENGINEERING_SUBJECT_NAMESPACE_REQUIRED"),
    subjectLabel: typeof payload.subjectLabel === "string" ? payload.subjectLabel : null,
    requirementKind: requiredString(payload, "requirementKind", "ENGINEERING_REQUIREMENT_KIND_REQUIRED") as never,
    approvedValue,
    approvedUnitLiteral: requiredString(payload, "approvedUnitLiteral", "ENGINEERING_UNIT_REQUIRED"),
    approvedUnitDimension: requiredString(payload, "approvedUnitDimension", "ENGINEERING_UNIT_DIMENSION_REQUIRED"),
    decisionBasis: requiredString(payload, "decisionBasis", "ENGINEERING_DECISION_BASIS_REQUIRED") as never,
    // Always the authenticated actor. Never a body value.
    actorUserId: context.actorUserId,
    rationale: requiredString(payload, "rationale", "ENGINEERING_RATIONALE_REQUIRED"),
    selectedCandidateId: typeof payload.selectedCandidateId === "string" ? payload.selectedCandidateId : null,
    consideredCandidateIds: stringList(payload.consideredCandidateIds),
    resolvedConflictSubjectKey: typeof payload.resolvedConflictSubjectKey === "string" ? payload.resolvedConflictSubjectKey : null,
    revisionMembershipIds: stringList(payload.revisionMembershipIds),
    documentIdentityIds: stringList(payload.documentIdentityIds),
  });

  return apiSuccess(
    { decision: result.decision, superseded: result.superseded, readiness: result.readiness },
    { status: 201, headers: NO_STORE },
  );
});
