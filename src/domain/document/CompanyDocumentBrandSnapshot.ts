export type CompanyDocumentBrandSnapshotV1 = {
  version: 1;
  nameAr: string | null;
  nameEn: string | null;
  addressAr: string | null;
  addressEn: string | null;
  poBox: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  logoUrl: string | null;
  brandTheme: string;
};

export type CompanyDocumentBrandSnapshotV2 = Omit<CompanyDocumentBrandSnapshotV1, "version"> & {
  version: 2;
  letterheadUrl: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
};

export type CompanyDocumentBrandSnapshot = CompanyDocumentBrandSnapshotV1 | CompanyDocumentBrandSnapshotV2;
export type CompanyDocumentBrandInput = Omit<CompanyDocumentBrandSnapshotV1, "version"> & {
  letterheadUrl?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

export function createCompanyDocumentBrandSnapshot(input: CompanyDocumentBrandInput): CompanyDocumentBrandSnapshotV2 {
  return {
    version: 2,
    nameAr: text(input.nameAr), nameEn: text(input.nameEn),
    addressAr: text(input.addressAr), addressEn: text(input.addressEn),
    poBox: text(input.poBox), phone: text(input.phone),
    mobile: text(input.mobile), whatsapp: text(input.whatsapp),
    logoUrl: text(input.logoUrl), brandTheme: text(input.brandTheme) ?? "NAVY_GOLD",
    letterheadUrl: text(input.letterheadUrl), signatureUrl: text(input.signatureUrl), stampUrl: text(input.stampUrl),
  };
}

export function parseCompanyDocumentBrandSnapshot(value: unknown): CompanyDocumentBrandSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 && record.version !== 2) return null;
  const base = {
    nameAr: text(record.nameAr), nameEn: text(record.nameEn),
    addressAr: text(record.addressAr), addressEn: text(record.addressEn),
    poBox: text(record.poBox), phone: text(record.phone),
    mobile: text(record.mobile), whatsapp: text(record.whatsapp),
    logoUrl: text(record.logoUrl), brandTheme: text(record.brandTheme) ?? "NAVY_GOLD",
  };
  if (record.version === 1) return { version: 1, ...base };
  return { version: 2, ...base, letterheadUrl: text(record.letterheadUrl), signatureUrl: text(record.signatureUrl), stampUrl: text(record.stampUrl) };
}
