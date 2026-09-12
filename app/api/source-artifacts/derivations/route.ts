import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { SourceArtifactPolicyError } from "@/src/application/source-artifacts/IngestSourceArtifact";
import { deriveSourceArtifact } from "@/src/application/source-artifacts/DeriveSourceArtifact";
import { linkUserProvidedDerivation } from "@/src/application/source-artifacts/LinkUserProvidedDerivation";

/**
 * Phase 2A-9: governed proprietary artifact derivation.
 *
 * POST /api/source-artifacts/derivations          — explicit automated derivation request
 * POST /api/source-artifacts/derivations?mode=link — explicit user-provided export link
 *
 * Both are explicit-only: nothing is ever inferred from filenames, upload
 * order, similar names, or temporal proximity. No commercial, engineering, or
 * procurement object is ever created here.
 */

function fail(error: unknown): never {
  if (error instanceof SourceArtifactPolicyError) {
    const status = error.code === "SOURCE_ARTIFACT_NOT_FOUND" ? 404 : 400;
    throw new ApiError(status, error.code, error.message);
  }
  throw error;
}

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      throw new ApiError(400, "DERIVATION_BODY_INVALID", "A JSON body is required.");
    }
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode === "link") {
      const originalArtifactId = typeof body.originalArtifactId === "string" ? body.originalArtifactId : "";
      const derivedArtifactId = typeof body.derivedArtifactId === "string" ? body.derivedArtifactId : "";
      if (!originalArtifactId || !derivedArtifactId) {
        throw new ApiError(400, "DERIVATION_LINK_REQUIRED", "Both originalArtifactId and derivedArtifactId are required for an explicit user-provided export link.");
      }
      const result = await linkUserProvidedDerivation({ companyId: company.companyId, userId: auth.user.id, originalArtifactId, derivedArtifactId });
      return apiSuccess({ derivation: { derivationKey: result.derivationKey, derivationId: result.derivationId, derivationKind: result.derivationKind }, idempotent: result.idempotent }, { status: result.idempotent ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
    }
    const originalArtifactId = typeof body.originalArtifactId === "string" ? body.originalArtifactId : "";
    if (!originalArtifactId) {
      throw new ApiError(400, "DERIVATION_ORIGINAL_REQUIRED", "originalArtifactId is required.");
    }
    const options = body.options && typeof body.options === "object" && !Array.isArray(body.options) ? body.options as Record<string, string | number | boolean | null> : {};
    const outcome = await deriveSourceArtifact({ companyId: company.companyId, userId: auth.user.id, originalArtifactId, options });
    return apiSuccess({ derivation: { derivationKey: outcome.derivationKey, status: outcome.status, derivedArtifactId: outcome.derivedArtifactId, failureReason: outcome.failureReason, warnings: outcome.warnings }, reused: outcome.reused }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { fail(error); }
});
