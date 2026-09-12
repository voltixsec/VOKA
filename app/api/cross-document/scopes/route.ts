import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor } from "@/lib/cross-document/route-context";
import { createScopeUseCase } from "@/src/application/cross-document/CrossDocumentUseCases";

/**
 * Phase 2A-10 comparison scopes.
 *
 * POST creates an explicit, durable comparison scope. Nothing is inferred from
 * filenames, upload order, or similar names: the caller names the scope and the
 * artifacts, and the default revision policy is ACTIVE_ONLY.
 *
 * No commercial, engineering, or procurement object is created here.
 */

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "CROSS_DOCUMENT_BODY_INVALID", "A JSON body is required.");
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 64);
}

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const payload = await body(request);
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const context = typeof payload.context === "string" && payload.context.trim() ? payload.context.trim() : "ENGINEERING_TENDER";
  if (!name) throw new ApiError(400, "CROSS_DOCUMENT_SCOPE_NAME_REQUIRED", "A comparison scope needs a name.");
  const result = await createScopeUseCase({
    ...contextFor({ request, actorUserId: auth.user.id, company }),
    name,
    context,
    projectKey: typeof payload.projectKey === "string" ? payload.projectKey : null,
    revisionPolicy: typeof payload.revisionPolicy === "string" ? payload.revisionPolicy : undefined,
    predicateFilters: stringList(payload.predicateFilters),
    roleFilters: stringList(payload.roleFilters),
    artifactIds: stringList(payload.artifactIds),
  });
  if (!result.ok) throw new ApiError(result.status, result.code, result.problem);
  return apiSuccess({ comparisonScope: result.value }, { status: 201, headers: NO_STORE });
});

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "25");
  const scopes = await context.store.listScopes({ companyId: company.companyId, limit: Number.isFinite(limit) ? limit : 25 });
  return apiSuccess({
    scopes: scopes.map((scope) => ({
      comparisonScopeId: scope.comparisonScopeId,
      name: scope.name,
      context: scope.context,
      projectKey: scope.projectKey,
      revisionPolicy: scope.revisionPolicy,
      lineageCollapse: scope.lineageCollapse,
      createdAt: scope.createdAt,
    })),
  }, { headers: NO_STORE });
});
