import { ApiError } from "@/lib/api";
import { validateCompanyImageAsset } from "@/features/company/domain/value-objects/CompanyImageAsset";

export const DOCUMENT_TYPES = ["QUOTATION", "SALES_ORDER", "CONTRACT", "INVOICE"] as const;

function optionalText(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw ApiError.badRequest("SIGNATORY_FIELD_INVALID", `${field} must be a string or null.`);
  return value.trim() || null;
}

export function parseSignatoryInput(body: Record<string, unknown>) {
  const nameAr = optionalText(body.nameAr, "nameAr");
  const nameEn = optionalText(body.nameEn, "nameEn");
  const titleAr = optionalText(body.titleAr, "titleAr");
  const titleEn = optionalText(body.titleEn, "titleEn");
  const signature = optionalText(body.signatureUrl, "signatureUrl");
  let signatureUrl: string | null | undefined = signature;
  if (signature !== undefined) {
    const result = validateCompanyImageAsset(signature, "signatureUrl");
    if (!result.valid) throw ApiError.badRequest("SIGNATORY_SIGNATURE_INVALID", `signatureUrl is invalid: ${result.reason}.`);
    signatureUrl = result.value;
  }

  let allowedDocumentTypes: string[] | undefined;
  if (body.allowedDocumentTypes !== undefined) {
    if (!Array.isArray(body.allowedDocumentTypes) || body.allowedDocumentTypes.some((value) => typeof value !== "string" || !DOCUMENT_TYPES.includes(value as never))) {
      throw ApiError.badRequest("SIGNATORY_DOCUMENT_TYPES_INVALID", "allowedDocumentTypes contains an unsupported document type.");
    }
    allowedDocumentTypes = [...new Set(body.allowedDocumentTypes as string[])];
  }

  const boolean = (field: "isActive" | "isDefault") => {
    const value = body[field];
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw ApiError.badRequest("SIGNATORY_FIELD_INVALID", `${field} must be boolean.`);
    return value;
  };

  return { nameAr, nameEn, titleAr, titleEn, signatureUrl, allowedDocumentTypes, isActive: boolean("isActive"), isDefault: boolean("isDefault") };
}

export function assertSignatoryIdentity(input: { nameAr?: string | null; nameEn?: string | null; titleAr?: string | null; titleEn?: string | null; allowedDocumentTypes?: string[] }) {
  if (!input.nameAr && !input.nameEn) throw ApiError.badRequest("SIGNATORY_NAME_REQUIRED", "At least one signatory name is required.");
  if (!input.titleAr && !input.titleEn) throw ApiError.badRequest("SIGNATORY_TITLE_REQUIRED", "At least one signatory title is required.");
  if (!input.allowedDocumentTypes?.length) throw ApiError.badRequest("SIGNATORY_DOCUMENT_TYPES_REQUIRED", "At least one allowed document type is required.");
}
