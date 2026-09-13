import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/engineering/route-context";
import { EngineeringBomService, EngineeringTakeoffService } from "@/src/application/engineering-takeoff";

/**
 * POST /api/engineering/takeoff-scopes/<takeoffScopeId>/bom-versions
 *
 * Creates a new governed BOM version from APPROVED decisions of this scope.
 * Creating a version never approves a quantity; it snapshots decisions that were
 * already approved.
 *
 * The version carries a required-subject coverage manifest, so a version built
 * from an approved SUBSET reports the unresolved required subjects rather than
 * presenting a partial BOM as complete (§5).
 *
 * GET lists the versions of the scope for the authenticated company.
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

  const service = new EngineeringBomService({ store, clock });
  const result = await service.createBomVersion({
    companyId: context.companyId,
    takeoffScopeId,
    engineeringScope: requiredString(payload, "engineeringScope", "ENGINEERING_SCOPE_LABEL_REQUIRED"),
    decisionIds: stringList(payload.decisionIds),
    actorUserId: context.actorUserId,
    reason: requiredString(payload, "reason", "ENGINEERING_REASON_REQUIRED"),
    changeNote: typeof payload.changeNote === "string" ? payload.changeNote : undefined,
    engineeringSubjects: (payload.engineeringSubjects ?? undefined) as never,
    constraints: (payload.constraints ?? undefined) as never,
    systemContexts: (payload.systemContexts ?? undefined) as never,
    locationContexts: (payload.locationContexts ?? undefined) as never,
  });

  return apiSuccess(
    { bomVersion: result.version, rows: result.rows, skippedDecisionIds: result.skippedDecisionIds },
    { status: 201, headers: NO_STORE },
  );
});

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const takeoffScopeId = pathSegment(request, 1);
  if (!takeoffScopeId) throw new ApiError(400, "ENGINEERING_SCOPE_REQUIRED", "A takeoff scope id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const { store, clock } = context.dependencies;
  const service = new EngineeringBomService({ store, clock });
  const versions = await service.listBomVersions({ companyId: context.companyId, takeoffScopeId });
  return apiSuccess({ bomVersions: versions }, { headers: NO_STORE });
});
