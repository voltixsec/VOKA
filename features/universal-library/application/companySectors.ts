export const UNIVERSAL_LIBRARY_SECTORS = [
  { code: "CCTV", ar: "كاميرات المراقبة", en: "CCTV" },
  { code: "ACCESS_CONTROL", ar: "التحكم في الدخول", en: "Access control" },
  { code: "FIRE_ALARM", ar: "إنذار الحريق", en: "Fire alarm" },
  { code: "NETWORKING", ar: "الشبكات", en: "Networking" },
  { code: "AUDIO_VISUAL", ar: "صوتيات ومرئيات", en: "Audio visual" },
  { code: "BMS", ar: "إدارة المباني", en: "Building management" },
] as const;

export type UniversalLibrarySectorCode = (typeof UNIVERSAL_LIBRARY_SECTORS)[number]["code"];

export const UNIVERSAL_LIBRARY_SECTOR_CODES = UNIVERSAL_LIBRARY_SECTORS.map((s) => s.code);

export const MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS = 3;

export function isUniversalLibrarySectorCode(value: string): value is UniversalLibrarySectorCode {
  return (UNIVERSAL_LIBRARY_SECTOR_CODES as string[]).includes(value);
}

export function validateCompanySectorSelection(codes: string[]) {
  const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (unique.length < 1) return { ok: false as const, error: "UNIVERSAL_LIBRARY_SECTOR_REQUIRED" };
  if (unique.length > MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS) {
    return { ok: false as const, error: "UNIVERSAL_LIBRARY_SECTOR_LIMIT" };
  }
  if (unique.some((code) => !isUniversalLibrarySectorCode(code))) {
    return { ok: false as const, error: "UNIVERSAL_LIBRARY_SECTOR_INVALID" };
  }
  return { ok: true as const, codes: unique as UniversalLibrarySectorCode[] };
}
