import { prisma } from "@/lib/prisma";
import { PrismaCustomerRepository } from "@/features/customers/infrastructure/prisma/PrismaCustomerRepository";
import { CreateQuotationUseCase } from "@/src/application/quotation";
import { parseCommercialDefaultsProfile, type CommercialHandoffQuotationPort, type HandoffCustomerResolution } from "@/src/application/conversation-runtime";
import type { QuotationScopeType } from "@/src/domain/quotation";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { PrismaQuotationReferenceValidator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator";
import { PrismaQuotationNumberGenerator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationNumberGenerator";

function normalizedName(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, " ").trim();
}

export class PrismaCommercialHandoffQuotationPort implements CommercialHandoffQuotationPort {
  private readonly quotationRepository: PrismaQuotationRepository;
  private readonly createQuotation: CreateQuotationUseCase;
  private readonly customerRepository: PrismaCustomerRepository;

  constructor(private readonly db = prisma) {
    this.quotationRepository = new PrismaQuotationRepository(db);
    this.createQuotation = new CreateQuotationUseCase(
      this.quotationRepository,
      new PrismaQuotationReferenceValidator(db),
      new PrismaQuotationNumberGenerator(db),
    );
    this.customerRepository = new PrismaCustomerRepository(db);
  }

  async findByHandoff(companyId: string, handoffId: string) {
    const quotation = await this.quotationRepository.findByFamilyId(companyId, handoffId);
    return quotation?.id ? { id: quotation.id, status: quotation.status, localizationPending: quotation.localizationStatus === "PENDING" } : null;
  }

  async resolveCustomer(companyId: string, confirmedName: string, locale: "ar" | "en"): Promise<HandoffCustomerResolution> {
    const matches = await this.customerRepository.findAll({ companyId, search: confirmedName, take: 20 });
    const wanted = normalizedName(confirmedName);
    const exact = matches.filter((customer) => [customer.name, customer.nameAr, customer.nameEn, customer.legalName].some((name) => name && normalizedName(name) === wanted));
    if (exact.length === 1) return { status: "RESOLVED", id: exact[0].id.toString(), name: exact[0].name };
    if (exact.length > 1 || matches.length > 0) {
      const candidates = (exact.length ? exact : matches).slice(0, 5).map((customer) => ({ id: customer.id.toString(), name: customer.name }));
      return { status: "AMBIGUOUS", proposedName: confirmedName.trim(), candidates };
    }
    return { status: "PENDING", proposedName: confirmedName.trim() };
  }

  async loadDefaults(companyId: string, scopeType: QuotationScopeType | null, locale?: "ar" | "en") {
    const [company, template] = await Promise.all([
      this.db.company.findUnique({ where: { id: companyId }, select: { defaultCurrency: true } }),
      scopeType ? this.db.companyQuotationTermsTemplate.findUnique({ where: { companyId_scopeType: { companyId, scopeType } }, select: { termsAr: true, termsEn: true } }) : null,
    ]);
    if (!company) throw new Error("COMPANY_NOT_FOUND");
    return parseCommercialDefaultsProfile({ currencyCode: company.defaultCurrency, termsAr: template?.termsAr ?? null, termsEn: template?.termsEn ?? null, locale });
  }

  async createDraft(input: Parameters<CommercialHandoffQuotationPort["createDraft"]>[0]) {
    let result;
    try {
      result = await this.createQuotation.execute(input);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        return { success: false as const, code: "QUOTATION_ALREADY_EXISTS", message: "Quotation number or handoff family already exists." };
      }
      throw error;
    }
    if (!result.success) return { success: false as const, code: result.error.code, message: result.error.message };
    if (!result.data.id) return { success: false as const, code: "QUOTATION_ID_MISSING", message: "Quotation persistence did not return an id." };
    if (result.data.status !== "DRAFT") return { success: false as const, code: "QUOTATION_NOT_DRAFT", message: "Commercial handoff may create draft quotations only." };
    return { success: true as const, draft: { id: result.data.id, status: result.data.status, localizationPending: result.data.localizationStatus === "PENDING" } };
  }
}
