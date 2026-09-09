import { prisma } from "@/lib/prisma";
import {
  UNIVERSAL_LIBRARY_SECTORS,
  validateCompanySectorSelection,
  type UniversalLibrarySectorCode,
} from "./companySectors";

export async function listCompanyUniversalLibrarySectors(companyId: string): Promise<UniversalLibrarySectorCode[]> {
  const rows = (await prisma.$queryRaw`
    SELECT "sectorCode" FROM "CompanyUniversalLibrarySector"
    WHERE "companyId" = ${companyId}
    ORDER BY "createdAt" ASC
  `) as Array<{ sectorCode: string }>;
  return rows
    .map((row: { sectorCode: string }) => row.sectorCode)
    .filter((code: string): code is UniversalLibrarySectorCode =>
      UNIVERSAL_LIBRARY_SECTORS.some((sector) => sector.code === code),
    );
}

export async function replaceCompanyUniversalLibrarySectors(companyId: string, codes: string[]) {
  const validated = validateCompanySectorSelection(codes);
  if (!validated.ok) return validated;
  await prisma.$transaction(async (tx: { $executeRaw: typeof prisma.$executeRaw }) => {
    await tx.$executeRaw`DELETE FROM "CompanyUniversalLibrarySector" WHERE "companyId" = ${companyId}`;
    for (const sectorCode of validated.codes) {
      await tx.$executeRaw`
        INSERT INTO "CompanyUniversalLibrarySector" ("id", "companyId", "sectorCode", "createdAt")
        VALUES (${`${companyId}-${sectorCode}`}, ${companyId}, ${sectorCode}, NOW())
      `;
    }
  });
  return { ok: true as const, codes: validated.codes };
}
