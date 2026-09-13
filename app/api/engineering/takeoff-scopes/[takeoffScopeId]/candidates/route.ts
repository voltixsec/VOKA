import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/engineering/route-context";
import { EngineeringTakeoffService } from "@/src/application/engineering-takeoff";

/**
 * POST /api/engineering/takeoff-scopes/<takeoffScopeId>/candidates
 *
 * Derives governed engineering quantity CANDIDATES from the accepted Phase 2A-10
 * handoff for this takeoff scope. A candidate is NOT an approval: it becomes a
 * governed quantity only through the explicit approval route.
 *
 * The route reads the accepted handoff and never a raw document or parser
 * summary. Conflicting sources are recorded, never averaged or auto-picked.
 */

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const takeoffScopeId = pathSegment(request, 1);
  if (!takeoffScopeId) throw new ApiError(400, "ENGINEERING_SCOPE_REQUIRED", "A takeoff scope id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const { store, handoffReader, occurrenceSource, clock } = context.dependencies;
  const service = new EngineeringTakeoffService({ store, handoffReader, occurrenceSource, clock });

  const scope = await service.findScope({ companyId: context.companyId, takeoffScopeId });
  if (!scope) throw new ApiError(404, "ENGINEERING_SCOPE_NOT_FOUND", "No such takeoff scope for this company.");

  const result = await service.deriveCandidates({ companyId: context.companyId, takeoffScopeId });
  return apiSuccess(
    {
      scope: result.scope,
      candidates: result.candidates,
      withheldClaims: result.withheldClaims,
      limitations: result.limitations,
    },
    { headers: NO_STORE },
  );
});
