import { apiSuccess, withCompanyAuth } from '@/lib/api';
import { getCustomerStatementSnapshot, parseCustomerStatementRequest } from '@/lib/reporting/customer-statement';

export const GET = withCompanyAuth(['OWNER', 'ADMIN', 'SALES', 'VIEWER'], async (request, _auth, company) => apiSuccess(await getCustomerStatementSnapshot(company.companyId, parseCustomerStatementRequest(request)), { headers: { 'Cache-Control': 'private, no-store' } }));
