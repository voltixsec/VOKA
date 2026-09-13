import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/engineering/route-context";
import { EngineeringTakeoffService } from "@/src/application/engineering-takeoff";

/**
 * GET /api/engineering/takeoff-scopes/<takeoffScopeId>
 *
 * Reads ONE takeoff scope of the authenticated company, plus its candidates,
 * counting rules, occurrence ledger, and governed decisions. Every read is
 * company-scoped, and a scope belonging to another company is reported as NOT
 * FOUND rather than returned (§7).
 *
 * Nothing commercial or procurement-related is exposed.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const takeoffScopeId = pathSegment(request);
  if (!takeoffScopeId) throw new ApiError(400, "ENGINEERING_SCOPE_REQUIRED", "A takeoff scope id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const { store, handoffReader, occurrenceSource, clock } = context.dependencies;
  const service = new EngineeringTakeoffService({ store, handoffReader, occurrenceSource, clock });

  const scope = await service.findScope({ companyId: context.companyId, takeoffScopeId });
  if (!scope) throw new ApiError(404, "ENGINEERING_SCOPE_NOT_FOUND", "No such takeoff scope for this company.");

  const [candidates, countingRules, occurrences] = await Promise.all([
    store.listCandidates({ companyId: context.companyId, takeoffScopeId, limit: 500 }),
    service.listCountingRules({ companyId: context.companyId, takeoffScopeId }),
    service.listOccurrences({ companyId: context.companyId, takeoffScopeId }),
  ]);

  return apiSuccess(
    {
      takeoffScope: scope,
      candidates,
      countingRules,
      occurrences,
      handoffVersion: "2a-11.handoff.v1",
    },
    { headers: NO_STORE },
  );
});
