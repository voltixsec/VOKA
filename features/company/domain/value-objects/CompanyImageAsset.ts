export const COMPANY_IMAGE_ASSET_LIMITS = {
  logoUrl: 750 * 1024,
  signatureUrl: 500 * 1024,
  stampUrl: 500 * 1024,
  letterheadUrl: 1536 * 1024,
} as const;

export type CompanyImageAssetField = keyof typeof COMPANY_IMAGE_ASSET_LIMITS;

export type CompanyImageAssetValidation =
  | { valid: true; value: string | null }
  | { valid: false; reason: "MALFORMED" | "UNSUPPORTED_MIME" | "TOO_LARGE" };

const DATA_URL = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/;

export function validateCompanyImageAsset(
  value: string | null,
  field: CompanyImageAssetField,
): CompanyImageAssetValidation {
  if (value === null || value.trim() === "") return { valid: true, value: null };

  const normalized = value.trim();
  const match = DATA_URL.exec(normalized);
  if (!match || match[2].length === 0 || match[2].length % 4 !== 0) return { valid: false, reason: "MALFORMED" };

  const mime = match[1].toLowerCase();
  if (mime !== "image/png" && mime !== "image/jpeg") {
    return { valid: false, reason: "UNSUPPORTED_MIME" };
  }

  const payload = match[2];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const decodedBytes = payload.length / 4 * 3 - padding;
  if (decodedBytes > COMPANY_IMAGE_ASSET_LIMITS[field]) {
    return { valid: false, reason: "TOO_LARGE" };
  }

  return { valid: true, value: normalized };
}
