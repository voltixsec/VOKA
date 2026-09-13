import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor } from "@/lib/engineering/route-context";
import { EngineeringTakeoffService } from "@/src/application/engineering-takeoff";

/**
 * Phase 2A-11 engineering takeoff scopes.
 *
 * POST opens an engineering takeoff scope bound to an accepted Phase 2A-10
 * comparison scope. The scope is an ANALYSIS ROOT, not a competing project
 * master: it references the existing project/context identity and never owns
 * project data.
 *
 * GET lists the scopes of the AUTHENTICATED company. The company id is never
 * read from the body or query (§7).
 *
 * No commercial, procurement, or quotation object is created or read here.
 */

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "ENGINEERING_BODY_INVALID", "A JSON body is required.");
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const payload = await body(request);
  const name = optionalString(payload.name);
  const scopeKind = optionalString(payload.scopeKind);
  const comparisonScopeId = optionalString(payload.comparisonScopeId);
  if (!name) throw new ApiError(400, "ENGINEERING_SCOPE_NAME_REQUIRED", "A takeoff scope needs a name.");
  if (!scopeKind) throw new ApiError(400, "ENGINEERING_SCOPE_KIND_REQUIRED", "A takeoff scope needs a scope kind.");
  if (!comparisonScopeId) throw new ApiError(400, "ENGINEERING_COMPARISON_SCOPE_REQUIRED", "A takeoff scope must reference an accepted comparison scope.");

  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const service = new EngineeringTakeoffService({
    store: context.dependencies.store,
    handoffReader: context.dependencies.handoffReader,
    occurrenceSource: context.dependencies.occurrenceSource,
    clock: context.dependencies.clock,
  });
  const scope = await service.openTakeoffScope({
    companyId: context.companyId,
    name,
    description: optionalString(payload.description),
    scopeKind: scopeKind as never,
    projectContextKey: optionalString(payload.projectContextKey) ?? null,
    comparisonScopeId,
    comparisonRunId: optionalString(payload.comparisonRunId) ?? null,
    createdByUserId: context.actorUserId,
  });
  return apiSuccess({ takeoffScope: scope }, { status: 201, headers: NO_STORE });
});

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(rawLimit) ? rawLimit : 25;
  const scopes = await context.dependencies.store.listScopes({ companyId: context.companyId, limit });
  return apiSuccess(
    {
      takeoffScopes: scopes.map((scope) => ({
        takeoffScopeId: scope.takeoffScopeId,
        name: scope.name,
        scopeKind: scope.scopeKind,
        state: scope.state,
        readiness: scope.readiness,
        comparisonScopeId: scope.comparisonScopeId,
        createdAt: scope.createdAt,
      })),
    },
    { headers: NO_STORE },
  );
});
