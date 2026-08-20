import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  CreateContractUseCase,
  ListContractsUseCase,
} from "@/src/application/contract";
import { PrismaContractRepository } from "@/src/infrastructure/persistence/prisma/contract/PrismaContractRepository";
import { PrismaCustomerRepository } from "@/features/customers/infrastructure/prisma/PrismaCustomerRepository";
import { serializeContract } from "./serialize-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contractRepository = new PrismaContractRepository(prisma);
const customerRepository = new PrismaCustomerRepository(prisma);

const createContractUseCase = new CreateContractUseCase(
  contractRepository,
  customerRepository,
);
const listContractsUseCase = new ListContractsUseCase(contractRepository);

function positiveInteger(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw ApiError.badRequest(
      "INVALID_PAGINATION",
      "Pagination values must be positive integers.",
    );
  }
  return parsed;
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const params = new URL(request.url).searchParams;
    const status = params.get("status") || undefined;
    const customerId = params.get("customerId") || undefined;
    const search = params.get("search") || undefined;
    const page = positiveInteger(params.get("page"), 1);
    const pageSize = positiveInteger(params.get("pageSize"), 20);

    const result = await listContractsUseCase.execute({
      companyId: company.companyId,
      status,
      customerId,
      search,
      page,
      pageSize,
    });

    return apiSuccess(
      {
        contracts: result.items.map((c) => serializeContract(c)),
        pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: Math.ceil(result.total / result.pageSize),
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  },
);

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, auth, company) => {
    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (typeof rawBody.customerId !== "string" || !rawBody.customerId.trim()) {
      throw ApiError.badRequest(
        "CUSTOMER_ID_REQUIRED",
        "customerId is required.",
        { field: "customerId" },
      );
    }

    if (!Array.isArray(rawBody.lines) || rawBody.lines.length === 0) {
      throw ApiError.badRequest(
        "CONTRACT_LINES_REQUIRED",
        "At least one line is required.",
        { field: "lines" },
      );
    }

    try {
      const contract = await createContractUseCase.execute({
        companyId: company.companyId,
        customerId: rawBody.customerId.trim(),
        provenance: rawBody.provenance as any,
        priceListId: typeof rawBody.priceListId === "string" ? rawBody.priceListId : undefined,
        currencyCode: typeof rawBody.currencyCode === "string" ? rawBody.currencyCode : undefined,
        contractDate: typeof rawBody.contractDate === "string" ? rawBody.contractDate : undefined,
        startDate: typeof rawBody.startDate === "string" ? rawBody.startDate : undefined,
        endDate: typeof rawBody.endDate === "string" ? rawBody.endDate : undefined,
        subjectAr: typeof rawBody.subjectAr === "string" ? rawBody.subjectAr : undefined,
        subjectEn: typeof rawBody.subjectEn === "string" ? rawBody.subjectEn : undefined,
        briefAr: typeof rawBody.briefAr === "string" ? rawBody.briefAr : undefined,
        briefEn: typeof rawBody.briefEn === "string" ? rawBody.briefEn : undefined,
        projectName: typeof rawBody.projectName === "string" ? rawBody.projectName : undefined,
        projectNameAr: typeof rawBody.projectNameAr === "string" ? rawBody.projectNameAr : undefined,
        projectNameEn: typeof rawBody.projectNameEn === "string" ? rawBody.projectNameEn : undefined,
        attentionName: typeof rawBody.attentionName === "string" ? rawBody.attentionName : undefined,
        attentionNameAr: typeof rawBody.attentionNameAr === "string" ? rawBody.attentionNameAr : undefined,
        attentionNameEn: typeof rawBody.attentionNameEn === "string" ? rawBody.attentionNameEn : undefined,
        scopeType: rawBody.scopeType as any,
        discountType: rawBody.discountType as any,
        discountValue: typeof rawBody.discountValue === "number" ? rawBody.discountValue : undefined,
        lines: rawBody.lines as any,
        milestones: Array.isArray(rawBody.milestones) ? rawBody.milestones as any : undefined,
        notes: typeof rawBody.notes === "string" ? rawBody.notes : undefined,
        notesAr: typeof rawBody.notesAr === "string" ? rawBody.notesAr : undefined,
        notesEn: typeof rawBody.notesEn === "string" ? rawBody.notesEn : undefined,
        termsAndConditions: typeof rawBody.termsAndConditions === "string" ? rawBody.termsAndConditions : undefined,
        termsAndConditionsAr: typeof rawBody.termsAndConditionsAr === "string" ? rawBody.termsAndConditionsAr : undefined,
        termsAndConditionsEn: typeof rawBody.termsAndConditionsEn === "string" ? rawBody.termsAndConditionsEn : undefined,
        actor: {
          userId: auth?.user?.id || null,
          name: auth?.user?.name || auth?.user?.email || company.role,
          role: company.role,
        },
      });

      return apiSuccess(serializeContract(contract), {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error: any) {
      if (error.name === "ContractDomainError" || error.name === "CommercialDomainError") {
        throw ApiError.badRequest("CONTRACT_DOMAIN_ERROR", error.message);
      }
      throw error;
    }
  },
);
