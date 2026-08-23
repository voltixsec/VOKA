import type { Quotation } from "../../../domain/quotation";
import { PrismaLocalizedContentRepository } from "../../../infrastructure/persistence/prisma/localization/PrismaLocalizedContentRepository";
import { LocalizedContentStatus } from "../../../domain/localization/types/LocalizedContentStatus";
import { isValidLocale, normalizeLocale } from "../../translation/ports/TranslationPort";

import type { ILocalizedContentRepository } from "../repositories/ILocalizedContentRepository";

export async function resolveQuotationGenericLocale(
  quotation: Quotation,
  requestedLocale: string,
  customRepository?: ILocalizedContentRepository,
): Promise<{
  subject: string | null;
  brief: string | null;
  projectName: string | null;
  attentionName: string | null;
  notes: string | null;
  termsAndConditions: string | null;
  lines: Array<{
    id: string;
    itemName: string | null;
    description: string | null;
    unitName: string | null;
  }>;
}> {
  const normLocale = isValidLocale(requestedLocale)
    ? normalizeLocale(requestedLocale)
    : "en";

  const isAr = normLocale === "ar" || normLocale.startsWith("ar-");
  const isEn = normLocale === "en" || normLocale.startsWith("en-");

  // Fallback defaults from legacy AR/EN fields
  const fallbackHeader = {
    subject: (isAr ? quotation.subjectAr : isEn ? quotation.subjectEn : (quotation.subjectAr || quotation.subjectEn)) ?? null,
    brief: (isAr ? quotation.briefAr : isEn ? quotation.briefEn : (quotation.briefAr || quotation.briefEn)) ?? null,
    projectName: (isAr ? (quotation.projectNameAr || quotation.projectName) : isEn ? (quotation.projectNameEn || quotation.projectName) : quotation.projectName) ?? null,
    attentionName: (isAr ? (quotation.attentionNameAr || quotation.attentionName) : isEn ? (quotation.attentionNameEn || quotation.attentionName) : quotation.attentionName) ?? null,
    notes: (isAr ? (quotation.notesAr || quotation.notes) : isEn ? (quotation.notesEn || quotation.notes) : quotation.notes) ?? null,
    termsAndConditions: (isAr ? (quotation.termsAndConditionsAr || quotation.termsAndConditions) : isEn ? (quotation.termsAndConditionsEn || quotation.termsAndConditions) : quotation.termsAndConditions) ?? null,
  };

  const fallbackLines = quotation.lines.map((line) => ({
    id: line.id ?? "",
    itemName: (isAr ? (line.itemNameAr || line.itemName) : isEn ? (line.itemNameEn || line.itemName) : line.itemName) ?? null,
    description: (isAr ? (line.descriptionAr || line.description) : isEn ? (line.descriptionEn || line.description) : line.description) ?? null,
    unitName: (isAr ? (line.unitNameAr || line.unitName) : isEn ? (line.unitNameEn || line.unitName) : line.unitName) ?? null,
  }));

  try {
    const locRepo = customRepository ?? new PrismaLocalizedContentRepository();
    const records = await locRepo.findByResourceAndLocale({
      companyId: quotation.companyId ?? "",
      resourceType: "Quotation",
      resourceId: quotation.id ?? "",
      locale: normLocale,
    });

    const validMap = new Map<string, string>();
    for (const r of records) {
      if (r.status === LocalizedContentStatus.VALID) {
        validMap.set(r.fieldKey, r.text);
      }
    }

    return {
      subject: validMap.get("subject") ?? fallbackHeader.subject,
      brief: validMap.get("brief") ?? fallbackHeader.brief,
      projectName: validMap.get("projectName") ?? fallbackHeader.projectName,
      attentionName: validMap.get("attentionName") ?? fallbackHeader.attentionName,
      notes: validMap.get("notes") ?? fallbackHeader.notes,
      termsAndConditions: validMap.get("termsAndConditions") ?? fallbackHeader.termsAndConditions,
      lines: fallbackLines.map((line) => ({
        id: line.id,
        itemName: validMap.get(`line:${line.id}:itemName`) ?? line.itemName,
        description: validMap.get(`line:${line.id}:description`) ?? line.description,
        unitName: validMap.get(`line:${line.id}:unitName`) ?? line.unitName,
      })),
    };
  } catch (error) {
    console.error(`[resolveQuotationGenericLocale] Failed to query generic persistence for quotation ${quotation.id}:`, error);
    return {
      ...fallbackHeader,
      lines: fallbackLines,
    };
  }
}
