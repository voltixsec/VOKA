import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { getCustomerActivitySnapshot } from '@/lib/reporting/customer-activity';
function id(request: Request) { const parts = new URL(request.url).pathname.split("/").filter(Boolean); const value = parts.at(-2); if (!value) throw ApiError.badRequest("CUSTOMER_ID_REQUIRED", "customerId is required."); return decodeURIComponent(value); }

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const { customer: _customer, projection: _projection, generatedAt: _generatedAt, ...summary } = await getCustomerActivitySnapshot(company.companyId, id(request), 'SCREEN');
  return apiSuccess(summary, { headers: { "Cache-Control": "private, no-store" } });
});
