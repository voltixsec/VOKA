import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import {
  listCompanyInstalledSectors,
  listGovernedRootSectors,
  replaceCompanyInstalledSectors,
} from "@/features/universal-library/application/persistCompanySectors";
import { MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS } from "@/features/universal-library/application/governedSectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (_request, _auth, company) => {
  const available = await listGovernedRootSectors();
  const installed = await listCompanyInstalledSectors(company.companyId);
  return apiSuccess({
    available,
    selected: installed.map((row) => row.categoryId),
    installed: installed.map((row) => {
      const category = available.find((item) => item.id === row.categoryId);
      return {
        categoryId: row.categoryId,
        name: category?.name ?? null,
        nameAr: category?.nameAr ?? null,
        nameEn: category?.nameEn ?? null,
      };
    }),
    max: MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS,
  });
});

export const PUT = withCompanyAuth(["OWNER", "ADMIN"], async (request, _auth, company) => {
  const body = (await request.json().catch(() => null)) as { categoryIds?: unknown } | null;
  const ids = Array.isArray(body?.categoryIds) ? body.categoryIds.map(String) : [];
  const result = await replaceCompanyInstalledSectors(company.companyId, ids);
  if (!result.ok) {
    const messages: Record<string, string> = {
      UNIVERSAL_LIBRARY_SECTOR_REQUIRED: "Select at least one library sector.",
      UNIVERSAL_LIBRARY_SECTOR_LIMIT: "At most three library sectors can be installed.",
      UNIVERSAL_LIBRARY_SECTOR_INVALID: "One or more sectors are not governed root categories.",
    };
    throw ApiError.badRequest(result.error, messages[result.error] ?? result.error);
  }
  const available = await listGovernedRootSectors();
  return apiSuccess({
    selected: result.ids,
    available,
    max: MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS,
  });
});
