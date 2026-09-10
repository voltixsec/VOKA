import { after } from "next/server";
import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { type CreateQuotationDto, CreateQuotationUseCase } from "@/src/application/quotation";
import { isQuotationScopeType } from "@/src/domain/quotation";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { PrismaQuotationReferenceValidator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator";
import { PrismaQuotationNumberGenerator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationNumberGenerator";
import { QuotationLocalizationJobRunner } from "@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner";
import { PrismaCommercialHandoffQuotationPort } from "@/src/infrastructure/ai/PrismaCommercialHandoffQuotationPort";

const quotationRepository = new PrismaQuotationRepository();
const createQuotation = new CreateQuotationUseCase(
  quotationRepository,
  new PrismaQuotationReferenceValidator(),
  new PrismaQuotationNumberGenerator(),
);
const localizationJobRunner = new QuotationLocalizationJobRunner(quotationRepository);

function getSessionId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const value = segments.at(-2);
  if (!value || value === "drawing-takeoffs") throw ApiError.badRequest("TAKEOFF_ID_REQUIRED", "sessionId is required.");
  return decodeURIComponent(value);
}

function optionalText(value: unknown, field: string, max = 500) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw ApiError.badRequest("TAKEOFF_QUOTATION_INPUT_INVALID", `${field} is invalid.`, { field });
  return value.trim() || null;
}

type ConfirmedTakeoffLine = {
  id: string;
  position: number;
  itemName: string;
  description: string | null;
  quantity: unknown;
  unitName: string | null;
  provenance: string;
  isConfirmed: boolean;
};

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, _auth, company) => {
  const sessionId = getSessionId(request);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const locale = body.locale === "ar" ? "ar" : "en";
  const customerId = optionalText(body.customerId, "customerId", 200);
  const scopeTypeValue = optionalText(body.scopeType, "scopeType", 80);
  if (scopeTypeValue && !isQuotationScopeType(scopeTypeValue)) throw ApiError.badRequest("INVALID_QUOTATION_SCOPE_TYPE", "scopeType is invalid.", { field: "scopeType" });
  const scopeType = scopeTypeValue && isQuotationScopeType(scopeTypeValue) ? scopeTypeValue : null;
  const projectName = optionalText(body.projectName, "projectName", 500);

  const session = await prisma.drawingTakeoffSession.findFirst({
    where: { id: sessionId, companyId: company.companyId },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!session) throw ApiError.notFound("TAKEOFF_NOT_FOUND", "Takeoff session was not found.");

  if (session.status === "CONVERTED" && session.quotationId) {
    const existing = await quotationRepository.findById(company.companyId, session.quotationId);
    if (existing?.id) return apiSuccess({ quotationId: existing.id, navigationTarget: `/dashboard/quotations/${existing.id}/edit`, created: false }, { headers: { "Cache-Control": "private, no-store" } });
    throw ApiError.conflict("TAKEOFF_QUOTATION_LINK_INVALID", "This takeoff is marked as converted but its quotation cannot be found.");
  }
  if (session.status !== "CONFIRMED") throw ApiError.conflict("TAKEOFF_NOT_CONFIRMED", "Review and confirm every takeoff quantity before opening a quotation draft.");
  const takeoffLines = session.lines as unknown as ConfirmedTakeoffLine[];
  if (!takeoffLines.length || takeoffLines.some((line) => !line.isConfirmed || line.quantity === null)) {
    throw ApiError.badRequest("TAKEOFF_REVIEW_INCOMPLETE", "Every takeoff quantity must be resolved and explicitly confirmed.");
  }

  const customer = customerId
    ? await new PrismaQuotationReferenceValidator().getCustomerSnapshot(company.companyId, customerId)
    : null;
  if (customerId && !customer) throw ApiError.badRequest("CUSTOMER_NOT_FOUND", "Customer was not found for the active company.");

  const defaults = await new PrismaCommercialHandoffQuotationPort(prisma).loadDefaults(company.companyId, scopeType, locale);
  const sourceLabel = locale === "ar" ? `حصر الرسم: ${session.sourceFileName}` : `Drawing takeoff: ${session.sourceFileName}`;
  const notes = locale === "ar"
    ? `مصدر هذه المسودة: ${sourceLabel}. تم نقل الكميات المؤكدة فقط من جلسة الحصر. الأسعار غير محددة وتحتاج مراجعة تجارية.`
    : `Draft source: ${sourceLabel}. Only explicitly confirmed quantities were transferred from the reviewed takeoff. Prices are unresolved and require commercial review.`;
  const lines: CreateQuotationDto["lines"] = takeoffLines.map((line) => ({
    position: line.position,
    type: "PRODUCT",
    itemName: line.itemName,
    itemNameAr: line.itemName,
    itemNameEn: line.itemName,
    description: line.description,
    unitName: line.unitName,
    quantity: Number(line.quantity),
    unitPrice: null,
    quantityStatus: "CONFIRMED",
    pricingStatus: "PENDING",
    productSelectionStatus: "GENERIC",
    engineeringStatus: "EXACT",
    commercialPricingStatus: "PENDING",
    provenance: line.provenance,
    engineeringComponentKeys: [line.id],
  }));
  const familyId = `drawing-takeoff:${session.id}`;
  const existing = await quotationRepository.findByFamilyId(company.companyId, familyId);
  if (existing?.id) {
    await prisma.drawingTakeoffSession.updateMany({ where: { id: session.id, companyId: company.companyId, quotationId: null }, data: { quotationId: existing.id, status: "CONVERTED", convertedAt: new Date() } });
    return apiSuccess({ quotationId: existing.id, navigationTarget: `/dashboard/quotations/${existing.id}/edit`, created: false }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const dto: CreateQuotationDto = {
    companyId: company.companyId,
    customerId,
    customer,
    familyId,
    currencyCode: defaults.currencyCode,
    scopeType,
    projectName,
    subjectAr: `مسودة عرض سعر — ${sourceLabel}`,
    subjectEn: `Quotation draft — ${sourceLabel}`,
    briefAr: "مسودة قابلة للمراجعة مبنية على كميات حصر مؤكدة من الرسم.",
    briefEn: "Reviewable draft based on confirmed quantities from a drawing takeoff.",
    notesAr: notes,
    notesEn: notes,
    termsAndConditions: locale === "ar" ? defaults.termsAr : defaults.termsEn,
    termsAndConditionsAr: defaults.termsAr,
    termsAndConditionsEn: defaults.termsEn,
    lines,
    localizationSourceLocale: locale,
  };

  let result;
  try {
    result = await createQuotation.execute(dto);
  } catch {
    const duplicate = await quotationRepository.findByFamilyId(company.companyId, familyId);
    if (duplicate) result = { success: true as const, data: duplicate };
    else throw new ApiError(500, "TAKEOFF_QUOTATION_CREATE_FAILED", "The quotation draft could not be created.");
  }
  if (!result.success) throw ApiError.badRequest(result.error.code, result.error.message);
  const quotationId = result.data.id;
  if (!quotationId) throw new ApiError(500, "TAKEOFF_QUOTATION_ID_MISSING", "The quotation draft was created without a usable identifier.");

  const linked = await prisma.drawingTakeoffSession.updateMany({
    where: { id: session.id, companyId: company.companyId, status: "CONFIRMED", quotationId: null },
    data: { quotationId, status: "CONVERTED", convertedAt: new Date() },
  });
  if (linked.count !== 1) {
    const linkedQuotation = await quotationRepository.findByFamilyId(company.companyId, familyId);
    if (!linkedQuotation?.id) throw ApiError.conflict("TAKEOFF_CONVERSION_CONFLICT", "The takeoff changed while the quotation draft was being prepared. Reload and try again.");
    return apiSuccess({ quotationId: linkedQuotation.id, navigationTarget: `/dashboard/quotations/${linkedQuotation.id}/edit`, created: false }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (result.data.localizationStatus === "PENDING") after(() => localizationJobRunner.run({ companyId: company.companyId, quotationId }));
  return apiSuccess({ quotationId, navigationTarget: `/dashboard/quotations/${quotationId}/edit`, created: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
});
