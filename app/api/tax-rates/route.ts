import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { ListAvailableQuotationTaxRatesUseCase } from "@/src/application/quotation";
import { PrismaQuotationReferenceValidator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator";

const listTaxRates = new ListAvailableQuotationTaxRatesUseCase(
  new PrismaQuotationReferenceValidator(),
);

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (_request, _auth, company) => {
    const result = await listTaxRates.execute(company.companyId);
    return apiSuccess(result.success ? result.data : []);
  },
);
