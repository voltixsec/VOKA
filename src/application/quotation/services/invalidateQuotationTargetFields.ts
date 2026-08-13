import type { Quotation } from "../../../domain/quotation";
import type { QuotationLineInput } from "../../../domain/quotation/types/QuotationLine";
import type { UpdateQuotationDto } from "../dto/UpdateQuotationDto";

function norm(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return value.trim() || null;
}

function processFieldPair(
  prevAr: string | null,
  prevEn: string | null,
  hasArInDto: boolean,
  hasEnInDto: boolean,
  dtoAr: string | null | undefined,
  dtoEn: string | null | undefined,
): { ar: string | null; en: string | null } {
  const incomingAr = hasArInDto ? norm(dtoAr) : prevAr;
  const incomingEn = hasEnInDto ? norm(dtoEn) : prevEn;

  const arChanged = hasArInDto && incomingAr !== prevAr;
  const enChanged = hasEnInDto && incomingEn !== prevEn;

  if (arChanged && (!hasEnInDto || norm(dtoEn) === prevEn)) {
    return { ar: incomingAr, en: null };
  }

  if (enChanged && (!hasArInDto || norm(dtoAr) === prevAr)) {
    return { ar: null, en: incomingEn };
  }

  return { ar: incomingAr, en: incomingEn };
}

export function invalidateQuotationTargetFields(
  existingQuotation: Quotation,
  dto: UpdateQuotationDto,
): UpdateQuotationDto {
  const result: UpdateQuotationDto = { ...dto };

  /* ========================================
     1. PROPOSAL & HEADER FIELDS
  ======================================== */

  // Subject
  const subjectResult = processFieldPair(
    norm(existingQuotation.subjectAr),
    norm(existingQuotation.subjectEn),
    dto.subjectAr !== undefined,
    dto.subjectEn !== undefined,
    dto.subjectAr,
    dto.subjectEn,
  );
  result.subjectAr = subjectResult.ar;
  result.subjectEn = subjectResult.en;

  // Brief
  const briefResult = processFieldPair(
    norm(existingQuotation.briefAr),
    norm(existingQuotation.briefEn),
    dto.briefAr !== undefined,
    dto.briefEn !== undefined,
    dto.briefAr,
    dto.briefEn,
  );
  result.briefAr = briefResult.ar;
  result.briefEn = briefResult.en;

  // Project Name
  const projectResult = processFieldPair(
    norm(existingQuotation.projectNameAr),
    norm(existingQuotation.projectNameEn),
    dto.projectNameAr !== undefined,
    dto.projectNameEn !== undefined,
    dto.projectNameAr,
    dto.projectNameEn,
  );
  result.projectNameAr = projectResult.ar;
  result.projectNameEn = projectResult.en;
  if (dto.projectName !== undefined) {
    result.projectName = norm(dto.projectName);
  } else if (existingQuotation.projectName) {
    result.projectName = norm(existingQuotation.projectName);
  }

  // Attention Name
  const attentionResult = processFieldPair(
    norm(existingQuotation.attentionNameAr),
    norm(existingQuotation.attentionNameEn),
    dto.attentionNameAr !== undefined,
    dto.attentionNameEn !== undefined,
    dto.attentionNameAr,
    dto.attentionNameEn,
  );
  result.attentionNameAr = attentionResult.ar;
  result.attentionNameEn = attentionResult.en;
  if (dto.attentionName !== undefined) {
    result.attentionName = norm(dto.attentionName);
  } else if (existingQuotation.attentionName) {
    result.attentionName = norm(existingQuotation.attentionName);
  }

  // Notes
  const notesResult = processFieldPair(
    norm(existingQuotation.notesAr),
    norm(existingQuotation.notesEn),
    dto.notesAr !== undefined,
    dto.notesEn !== undefined,
    dto.notesAr,
    dto.notesEn,
  );
  result.notesAr = notesResult.ar;
  result.notesEn = notesResult.en;
  if (dto.notes !== undefined) {
    result.notes = norm(dto.notes);
  } else if (existingQuotation.notes) {
    result.notes = norm(existingQuotation.notes);
  }

  // Terms and Conditions
  const termsResult = processFieldPair(
    norm(existingQuotation.termsAndConditionsAr),
    norm(existingQuotation.termsAndConditionsEn),
    dto.termsAndConditionsAr !== undefined,
    dto.termsAndConditionsEn !== undefined,
    dto.termsAndConditionsAr,
    dto.termsAndConditionsEn,
  );
  result.termsAndConditionsAr = termsResult.ar;
  result.termsAndConditionsEn = termsResult.en;
  if (dto.termsAndConditions !== undefined) {
    result.termsAndConditions = norm(dto.termsAndConditions);
  } else if (existingQuotation.termsAndConditions) {
    result.termsAndConditions = norm(existingQuotation.termsAndConditions);
  }

  /* ========================================
     2. QUOTATION LINES
  ======================================== */

  if (Array.isArray(dto.lines)) {
    result.lines = dto.lines.map((lineDto) => {
      // Previous persisted quotation lines MUST be matched ONLY by stable ID
      const prevLine = lineDto.id
        ? existingQuotation.lines.find((l) => l.id === lineDto.id)
        : undefined;

      if (!prevLine) {
        return lineDto;
      }

      // Preserve non-text line properties from prevLine if omitted in partial line update
      const updatedLine: QuotationLineInput = {
        id: prevLine.id,
        catalogItemId:
          lineDto.catalogItemId !== undefined ? lineDto.catalogItemId : prevLine.catalogItemId,
        taxRateId: lineDto.taxRateId !== undefined ? lineDto.taxRateId : prevLine.taxRateId,
        position: typeof lineDto.position === "number" ? lineDto.position : prevLine.position,
        type: lineDto.type ?? prevLine.type,
        itemCode: lineDto.itemCode !== undefined ? lineDto.itemCode : prevLine.itemCode,
        quantity: typeof lineDto.quantity === "number" ? lineDto.quantity : prevLine.quantity,
        unitPrice: typeof lineDto.unitPrice === "number" ? lineDto.unitPrice : prevLine.unitPrice,
        discount: lineDto.discount !== undefined ? lineDto.discount : prevLine.discount,
        taxPercentage:
          typeof lineDto.taxPercentage === "number"
            ? lineDto.taxPercentage
            : prevLine.taxPercentage,
        itemName: "",
      };

      // Item Name
      const itemNamePair = processFieldPair(
        norm(prevLine.itemNameAr),
        norm(prevLine.itemNameEn),
        lineDto.itemNameAr !== undefined,
        lineDto.itemNameEn !== undefined,
        lineDto.itemNameAr,
        lineDto.itemNameEn,
      );
      updatedLine.itemNameAr = itemNamePair.ar;
      updatedLine.itemNameEn = itemNamePair.en;
      if (lineDto.itemName !== undefined) {
        updatedLine.itemName = norm(lineDto.itemName) || prevLine.itemName;
      } else {
        updatedLine.itemName = prevLine.itemName;
      }

      // Description
      const descPair = processFieldPair(
        norm(prevLine.descriptionAr),
        norm(prevLine.descriptionEn),
        lineDto.descriptionAr !== undefined,
        lineDto.descriptionEn !== undefined,
        lineDto.descriptionAr,
        lineDto.descriptionEn,
      );
      updatedLine.descriptionAr = descPair.ar;
      updatedLine.descriptionEn = descPair.en;
      if (lineDto.description !== undefined) {
        updatedLine.description = norm(lineDto.description);
      } else {
        updatedLine.description = norm(prevLine.description);
      }

      // Unit Name
      const unitPair = processFieldPair(
        norm(prevLine.unitNameAr),
        norm(prevLine.unitNameEn),
        lineDto.unitNameAr !== undefined,
        lineDto.unitNameEn !== undefined,
        lineDto.unitNameAr,
        lineDto.unitNameEn,
      );
      updatedLine.unitNameAr = unitPair.ar;
      updatedLine.unitNameEn = unitPair.en;
      if (lineDto.unitName !== undefined) {
        updatedLine.unitName = norm(lineDto.unitName);
      } else {
        updatedLine.unitName = norm(prevLine.unitName);
      }

      return updatedLine;
    });
  }

  return result;
}
