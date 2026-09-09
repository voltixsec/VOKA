import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PrismaCatalogItemRepository } from "@/features/catalog";
import { commitCatalogRows } from "@/features/catalog/application/xlsx/catalogXlsx";
import { previewUploadedCatalog } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, _auth, company) => {
    const preview = await previewUploadedCatalog(company.companyId, await request.formData());
    if (preview.invalid > 0) {
      throw ApiError.conflict("CATALOG_XLSX_COMMIT_BLOCKED", "No rows were imported because the workbook is invalid.");
    }
    const inputs = preview.rows.map((row) => row.input).filter((row): row is NonNullable<typeof row> => Boolean(row));
    try {
      const imported = await prisma.$transaction(async (tx) => {
        const repository = new PrismaCatalogItemRepository(tx as never);
        return commitCatalogRows(repository, company.companyId, inputs);
      });
      return apiSuccess({ importedCount: imported.length, ids: imported });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as { code?: string }).code) : "CATALOG_XLSX_COMMIT_FAILED";
      throw ApiError.conflict(code, "No rows were imported.");
    }
  },
);
