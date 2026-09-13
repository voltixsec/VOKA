import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/engineering/route-context";
import { EngineeringBomService } from "@/src/application/engineering-takeoff";

/**
 * GET /api/engineering/bom-versions/<bomVersionId>
 *
 * Reads ONE BOM version of the authenticated company with its rows. A version
 * belonging to another company is reported as NOT FOUND rather than returned
 * (§7).
 *
 * The response surfaces completeness honestly: `unresolvedRequiredSubjectCount`
 * and the coverage reasons travel with the version, so a caller can never read
 * a partial BOM as though it were whole. No price, currency, supplier, RFQ,
 * offer, award, or procurement quantity field exists anywhere in the payload.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const bomVersionId = pathSegment(request);
  if (!bomVersionId) throw new ApiError(400, "ENGINEERING_BOM_VERSION_REQUIRED", "A BOM version id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const { store, clock } = context.dependencies;
  const service = new EngineeringBomService({ store, clock });

  const version = await service.findBomVersion({ companyId: context.companyId, bomVersionId });
  if (!version) throw new ApiError(404, "ENGINEERING_BOM_VERSION_NOT_FOUND", "No such BOM version for this company.");

  const [rows, requiredSubjects, weakestReadiness] = await Promise.all([
    service.listRows({ companyId: context.companyId, bomVersionId }),
    store.listRequiredSubjects({ companyId: context.companyId, bomVersionId }),
    service.weakestReadiness({ companyId: context.companyId, bomVersionId }),
  ]);

  return apiSuccess(
    {
      bomVersion: version,
      rows,
      requiredSubjects,
      weakestReadiness,
      // Explicit so a consumer cannot mistake an approved subset for a whole BOM.
      isComplete: version.completeness === "APPROVED" && version.unresolvedRequiredSubjectCount === 0,
    },
    { headers: NO_STORE },
  );
});
