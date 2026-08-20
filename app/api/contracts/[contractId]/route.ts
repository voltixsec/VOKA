import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  GetContractUseCase,
  UpdateContractReferenceError,
  UpdateContractUseCase,
} from "@/src/application/contract";
import { PrismaContractRepository } from "@/src/infrastructure/persistence/prisma/contract/PrismaContractRepository";
import { PrismaContractReferenceResolver } from "@/src/infrastructure/persistence/prisma/contract/PrismaContractReferenceResolver";
import { PrismaCustomerRepository } from "@/features/customers/infrastructure/prisma/PrismaCustomerRepository";
import {
  PricingService,
  type PricingDbClient,
} from "@/src/application/pricing/services/PricingService";
import { serializeContract } from "../serialize-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contractRepository = new PrismaContractRepository(prisma);
const customerRepository = new PrismaCustomerRepository(prisma);
const contractReferenceResolver = new PrismaContractReferenceResolver(prisma);
const pricingService = new PricingService(prisma as unknown as PricingDbClient);

const getContractUseCase = new GetContractUseCase(contractRepository);
const updateContractUseCase = new UpdateContractUseCase(
  contractRepository,
  customerRepository,
  contractReferenceResolver,
  pricingService,
);

function getContractIdFromUrl(urlStr: string): string {
  const url = new URL(urlStr);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const contractId = pathSegments[pathSegments.length - 1];

  if (!contractId || contractId === "contracts") {
    throw ApiError.notFound("CONTRACT_NOT_FOUND", "Contract not found.");
  }

  return decodeURIComponent(contractId);
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const contractId = getContractIdFromUrl(request.url);

    const contract = await getContractUseCase.execute(
      company.companyId,
      contractId,
    );

    if (!contract) {
      throw ApiError.notFound("CONTRACT_NOT_FOUND", "Contract not found.");
    }

    return apiSuccess(serializeContract(contract), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);

async function handleUpdate(
  request: Request,
  auth: any,
  company: { companyId: string; role: string },
) {
  const contractId = getContractIdFromUrl(request.url);
  const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (Array.isArray(rawBody.lines) && rawBody.lines.length === 0) {
    throw ApiError.badRequest(
      "CONTRACT_LINES_REQUIRED",
      "At least one line is required.",
      { field: "lines" },
    );
  }

  try {
    const updatedContract = await updateContractUseCase.execute({
      contractId,
      companyId: company.companyId,
      customerId: typeof rawBody.customerId === "string" ? rawBody.customerId.trim() : undefined,
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
      lines: Array.isArray(rawBody.lines) ? (rawBody.lines as any) : undefined,
      milestones: Array.isArray(rawBody.milestones) ? (rawBody.milestones as any) : undefined,
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

    return apiSuccess(serializeContract(updatedContract), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    if (error instanceof UpdateContractReferenceError) {
      if (error.code === "CONTRACT_NOT_FOUND" || error.code === "CUSTOMER_NOT_FOUND") {
        throw ApiError.notFound(error.code, error.message);
      }
      throw ApiError.badRequest(error.code, error.message);
    }
    if (error.name === "ContractDomainError" || error.name === "CommercialDomainError") {
      throw ApiError.badRequest("CONTRACT_DOMAIN_ERROR", error.message);
    }
    throw error;
  }
}

export const PUT = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, auth, company) => handleUpdate(request, auth, company),
);

export const PATCH = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, auth, company) => handleUpdate(request, auth, company),
);
