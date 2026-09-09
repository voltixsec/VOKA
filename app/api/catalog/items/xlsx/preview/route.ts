import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { previewUploadedCatalog } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, _auth, company) => {
    const preview = await previewUploadedCatalog(company.companyId, await request.formData());
    return apiSuccess({
      imported: false,
      headers: preview.headers,
      total: preview.total,
      valid: preview.valid,
      invalid: preview.invalid,
      rows: preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        values: row.values,
        valid: row.valid,
        errors: row.errors,
      })),
    });
  },
);
