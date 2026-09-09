import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { UNIVERSAL_LIBRARY_SECTORS } from "@/features/universal-library/application/companySectors";
import {
  listCompanyUniversalLibrarySectors,
  replaceCompanyUniversalLibrarySectors,
} from "@/features/universal-library/application/persistCompanySectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (_request, _auth, company) => {
  const selected = await listCompanyUniversalLibrarySectors(company.companyId);
  return apiSuccess({
    available: UNIVERSAL_LIBRARY_SECTORS,
    selected,
    max: 3,
  });
});

export const PUT = withCompanyAuth(["OWNER", "ADMIN"], async (request, _auth, company) => {
  const body = (await request.json().catch(() => null)) as { sectorCodes?: unknown } | null;
  const codes = Array.isArray(body?.sectorCodes) ? body.sectorCodes.map(String) : [];
  const result = await replaceCompanyUniversalLibrarySectors(company.companyId, codes);
  if (!result.ok) {
    const messages: Record<string, string> = {
      UNIVERSAL_LIBRARY_SECTOR_REQUIRED: "Select at least one sector.",
      UNIVERSAL_LIBRARY_SECTOR_LIMIT: "At most three sectors can be installed.",
      UNIVERSAL_LIBRARY_SECTOR_INVALID: "One or more sectors are invalid.",
    };
    throw ApiError.badRequest(result.error, messages[result.error] ?? result.error);
  }
  return apiSuccess({ selected: result.codes, available: UNIVERSAL_LIBRARY_SECTORS, max: 3 });
});
