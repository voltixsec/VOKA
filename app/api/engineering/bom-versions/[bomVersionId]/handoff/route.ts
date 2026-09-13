import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/engineering/route-context";
import { ENGINEERING_HANDOFF_VERSION, buildEngineeringBomHandoff, latestApprovedBomHandoff } from "@/src/application/engineering-takeoff";

/**
 * GET /api/engineering/bom-versions/<bomVersionId>/handoff
 *
 * The stable read contract Phase 2A-12 consumes. Only an APPROVED version is
 * publishable: a DRAFT version has no approved engineering truth, and handing
 * one over would let a downstream phase act on values no human adopted.
 *
 * The bundle declares `notExposed` explicitly, and carries no quotation, price,
 * currency, supplier, RFQ, offer, award, or procurement quantity field.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const bomVersionId = pathSegment(request, 1);
  if (!bomVersionId) throw new ApiError(400, "ENGINEERING_BOM_VERSION_REQUIRED", "A BOM version id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const { store } = context.dependencies;

  // Optional scope form: ?latestApprovedForScope=<takeoffScopeId>
  const latestForScope = new URL(request.url).searchParams.get("latestApprovedForScope");

  try {
    const handoff = latestForScope
      ? await latestApprovedBomHandoff({ store }, { companyId: context.companyId, takeoffScopeId: latestForScope })
      : await buildEngineeringBomHandoff({ store }, { companyId: context.companyId, bomVersionId });

    if (!handoff) throw new ApiError(404, "ENGINEERING_HANDOFF_NOT_FOUND", "No approved BOM version for this company and scope.");

    return apiSuccess({ handoff, contractVersion: ENGINEERING_HANDOFF_VERSION }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error instanceof Error ? error.message : "The engineering handoff could not be built.";
    // A version of another company, or a non-approved version, is not readable here.
    throw new ApiError(404, "ENGINEERING_HANDOFF_NOT_FOUND", message);
  }
});
