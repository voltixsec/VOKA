import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/engineering/route-context";
import { EngineeringBomService } from "@/src/application/engineering-takeoff";

/**
 * POST /api/engineering/bom-versions/<bomVersionId>/approve
 *
 * THE governed BOM version approval action. Approval is refused when the
 * version's required-subject coverage is incomplete: an approved SUBSET is never
 * approved as a whole BOM (§5).
 *
 * Approval is attributed to the authenticated actor and makes the version
 * immutable; a later change requires a new version.
 */

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const POST = withCompanyAuth(["OWNER", "ADMIN"], async (request, auth, company) => {
  const bomVersionId = pathSegment(request, 1);
  if (!bomVersionId) throw new ApiError(400, "ENGINEERING_BOM_VERSION_REQUIRED", "A BOM version id is required.");
  const payload = await body(request);
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const { store, clock } = context.dependencies;
  const service = new EngineeringBomService({ store, clock });

  try {
    const version = await service.approveBomVersion({
      companyId: context.companyId,
      bomVersionId,
      // Always the authenticated actor. Never a body value.
      approvedByUserId: context.actorUserId,
      approvalNote: typeof payload.approvalNote === "string" ? payload.approvalNote : undefined,
    });
    return apiSuccess({ bomVersion: version }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "BOM version approval failed.";
    throw new ApiError(409, "ENGINEERING_BOM_APPROVAL_REFUSED", message);
  }
});
