export const MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS = 3;

/** Taxonomy bootstrap keys for missing root commercial sectors. Not a UI list. */
export const CORE_COMMERCIAL_SECTOR_BOOTSTRAP = [
  {
    code: "CONSTRUCTION_CONTRACTING",
    name: "Construction & Contracting",
    nameEn: "Construction & Contracting",
    nameAr: "المقاولات والإنشاءات",
  },
  {
    code: "HOSPITALITY",
    name: "Hospitality",
    nameEn: "Hospitality",
    nameAr: "الضيافة والفنادق",
  },
  {
    code: "SECURITY_SURVEILLANCE",
    name: "Security & Surveillance Systems",
    nameEn: "Security & Surveillance Systems",
    nameAr: "أنظمة الأمن والمراقبة",
  },
  {
    code: "IT_NETWORKING",
    name: "IT & Networking",
    nameEn: "IT & Networking",
    nameAr: "تقنية المعلومات والشبكات",
  },
  {
    code: "ELECTRICAL_POWER",
    name: "Electrical & Power",
    nameEn: "Electrical & Power",
    nameAr: "الكهرباء والطاقة",
  },
  {
    code: "HVAC_MECHANICAL",
    name: "HVAC & Mechanical",
    nameEn: "HVAC & Mechanical",
    nameAr: "التكييف والميكانيكا",
  },
] as const;

export function isGovernedCommercialRoot(row: {
  parentId?: string | null;
  code?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
}) {
  if (row.parentId) return false;
  const codes = new Set<string>(CORE_COMMERCIAL_SECTOR_BOOTSTRAP.map((s) => s.code));
  const namesEn = new Set<string>(CORE_COMMERCIAL_SECTOR_BOOTSTRAP.map((s) => s.nameEn));
  const namesAr = new Set<string>(CORE_COMMERCIAL_SECTOR_BOOTSTRAP.map((s) => s.nameAr));
  return Boolean(
    (row.code && codes.has(row.code)) ||
      (row.nameEn && namesEn.has(row.nameEn)) ||
      (row.nameAr && namesAr.has(row.nameAr)),
  );
}

export function validateInstalledCategoryIds(ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length < 1) return { ok: false as const, error: "UNIVERSAL_LIBRARY_SECTOR_REQUIRED" as const };
  if (unique.length > MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS) {
    return { ok: false as const, error: "UNIVERSAL_LIBRARY_SECTOR_LIMIT" as const };
  }
  return { ok: true as const, ids: unique };
}
