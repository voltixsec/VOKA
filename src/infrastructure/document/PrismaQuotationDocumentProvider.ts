import { prisma } from "@/lib/prisma";
import {
  GenerateQuotationDocumentUseCase,
  type QuotationDocumentProvider,
  type QuotationDocumentProviderResult,
} from "@/src/application/document";

const companyIdentitySelect = {
  name: true,
  nameAr: true,
  nameEn: true,
  addressAr: true,
  addressEn: true,
  poBox: true,
  phone: true,
  mobile: true,
  whatsapp: true,
  logoUrl: true,
  letterheadUrl: true,
  signatureUrl: true,
  stampUrl: true,
  brandTheme: true,
} as const;

export class PrismaQuotationDocumentProvider
  implements QuotationDocumentProvider {
  constructor(
    private readonly generateDocument: GenerateQuotationDocumentUseCase,
    private readonly db = prisma,
    private readonly publicBaseUrl: string | null =
      process.env.VOKA_PUBLIC_URL ?? null,
  ) {}

  async generate(input: {
    companyId: string;
    quotationId: string;
    locale: "ar" | "en";
  }): Promise<QuotationDocumentProviderResult> {
    const company = await this.db.company.findUnique({
      where: { id: input.companyId },
      select: companyIdentitySelect,
    });

    if (!company) {
      return {
        success: false,
        error: {
          code: "COMPANY_NOT_FOUND",
          message: "Company not found.",
        },
      };
    }

    const result = await this.generateDocument.execute({
      companyId: input.companyId,
      companyName: company.name || "VOKA",
      companyIdentity: {
        nameAr: company.nameAr,
        nameEn: company.nameEn,
        addressAr: company.addressAr,
        addressEn: company.addressEn,
        poBox: company.poBox,
        phone: company.phone,
        mobile: company.mobile,
        whatsapp: company.whatsapp,
        logoUrl: company.logoUrl,
        letterheadUrl: company.letterheadUrl,
        signatureUrl: company.signatureUrl,
        stampUrl: company.stampUrl,
        brandTheme: company.brandTheme,
      },
      quotationId: input.quotationId,
      locale: input.locale,
      publicBaseUrl: this.publicBaseUrl,
    });

    if (!result.success) return result;

    return {
      success: true,
      data: {
        filename: result.data.filename,
        contentType: "application/pdf",
        bytes: result.data.bytes,
      },
    };
  }
}
