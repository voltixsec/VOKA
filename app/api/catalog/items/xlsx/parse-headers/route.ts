import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { parseCatalogWorkbookFile } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request) => {
  const { parsed } = await parseCatalogWorkbookFile(await request.formData());
  return apiSuccess({ headers: parsed.headers });
});
