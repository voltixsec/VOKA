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

export type AuthorizedSignatorySnapshot = {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  titleAr: string | null;
  titleEn: string | null;
  signatureUrl: string | null;
};

export type CompanyDocumentBrandSnapshotV3 = Omit<CompanyDocumentBrandSnapshotV2, "version"> & {
  version: 3;
  authorizedSignatory: AuthorizedSignatorySnapshot | null;
};

export type CompanyDocumentBrandSnapshot = CompanyDocumentBrandSnapshotV1 | CompanyDocumentBrandSnapshotV2 | CompanyDocumentBrandSnapshotV3;
export type CompanyDocumentBrandInput = Omit<CompanyDocumentBrandSnapshotV1, "version"> & {
  letterheadUrl?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  authorizedSignatory?: AuthorizedSignatorySnapshot | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

export function createCompanyDocumentBrandSnapshot(input: CompanyDocumentBrandInput): CompanyDocumentBrandSnapshotV3 {
  return {
    version: 3,
    nameAr: text(input.nameAr), nameEn: text(input.nameEn),
    addressAr: text(input.addressAr), addressEn: text(input.addressEn),
    poBox: text(input.poBox), phone: text(input.phone),
    mobile: text(input.mobile), whatsapp: text(input.whatsapp),
    logoUrl: text(input.logoUrl), brandTheme: text(input.brandTheme) ?? "NAVY_GOLD",
    letterheadUrl: text(input.letterheadUrl), signatureUrl: text(input.signatureUrl), stampUrl: text(input.stampUrl),
    authorizedSignatory: input.authorizedSignatory
      ? {
          id: input.authorizedSignatory.id.trim(),
          nameAr: text(input.authorizedSignatory.nameAr), nameEn: text(input.authorizedSignatory.nameEn),
          titleAr: text(input.authorizedSignatory.titleAr), titleEn: text(input.authorizedSignatory.titleEn),
          signatureUrl: text(input.authorizedSignatory.signatureUrl),
        }
      : null,
  };
}

export function parseCompanyDocumentBrandSnapshot(value: unknown): CompanyDocumentBrandSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 && record.version !== 2 && record.version !== 3) return null;
  const base = {
    nameAr: text(record.nameAr), nameEn: text(record.nameEn),
    addressAr: text(record.addressAr), addressEn: text(record.addressEn),
    poBox: text(record.poBox), phone: text(record.phone),
    mobile: text(record.mobile), whatsapp: text(record.whatsapp),
    logoUrl: text(record.logoUrl), brandTheme: text(record.brandTheme) ?? "NAVY_GOLD",
  };
  if (record.version === 1) return { version: 1, ...base };
  const assets = { letterheadUrl: text(record.letterheadUrl), signatureUrl: text(record.signatureUrl), stampUrl: text(record.stampUrl) };
  if (record.version === 2) return { version: 2, ...base, ...assets };
  const signatory = record.authorizedSignatory;
  const parsedSignatory = signatory && typeof signatory === "object" && !Array.isArray(signatory)
    ? {
        id: text((signatory as Record<string, unknown>).id) ?? "",
        nameAr: text((signatory as Record<string, unknown>).nameAr), nameEn: text((signatory as Record<string, unknown>).nameEn),
        titleAr: text((signatory as Record<string, unknown>).titleAr), titleEn: text((signatory as Record<string, unknown>).titleEn),
        signatureUrl: text((signatory as Record<string, unknown>).signatureUrl),
      }
    : null;
  return { version: 3, ...base, ...assets, authorizedSignatory: parsedSignatory?.id ? parsedSignatory : null };
}
