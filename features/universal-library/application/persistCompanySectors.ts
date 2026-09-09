import {
  CORE_COMMERCIAL_SECTOR_BOOTSTRAP,
  MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS,
  validateInstalledCategoryIds,
} from "./governedSectors";

type PrismaLike = {
  universalCategory: {
    findMany: (args: unknown) => Promise<Array<{ id: string; parentId?: string | null; code?: string | null; name?: string; nameAr?: string | null; nameEn?: string | null }>>;
    create: (args: unknown) => Promise<{ id: string; parentId: string | null; code: string | null; name: string; nameAr: string | null; nameEn: string | null }>;
  };
  $transaction: (fn: (tx: PrismaLike) => Promise<unknown>) => Promise<unknown>;
};

async function defaultClient(): Promise<PrismaLike> {
  const mod = await import("@/lib/prisma");
  return mod.prisma as unknown as PrismaLike;
}

type SectorRow = {
  id: string;
  companyId: string;
  categoryId: string;
  isActive: boolean;
  createdAt: Date;
};

type SectorDelegate = {
  findMany: (args: unknown) => Promise<SectorRow[]>;
  deleteMany: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<SectorRow>;
};

function sectors(client: PrismaLike): SectorDelegate {
  return (client as PrismaLike & { companyUniversalLibrarySector: SectorDelegate }).companyUniversalLibrarySector;
}

export async function ensureGovernedCoreSectors(client?: PrismaLike) {
  const db = client ?? (await defaultClient());
  const existing = await db.universalCategory.findMany({
    where: { parentId: null, isActive: true },
  });
  for (const spec of CORE_COMMERCIAL_SECTOR_BOOTSTRAP) {
    const match =
      existing.find((row) => row.code === spec.code) ||
      existing.find((row) => row.nameEn === spec.nameEn) ||
      existing.find((row) => row.nameAr === spec.nameAr);
    if (match) continue;
    const created = await db.universalCategory.create({
      data: {
        parentId: null,
        code: spec.code,
        name: spec.name,
        nameEn: spec.nameEn,
        nameAr: spec.nameAr,
        isActive: true,
      },
    });
    existing.push(created);
  }
  const codes = new Set<string>(CORE_COMMERCIAL_SECTOR_BOOTSTRAP.map((s) => s.code));
  const names = new Set<string>(CORE_COMMERCIAL_SECTOR_BOOTSTRAP.map((s) => s.nameEn));
  return existing.filter(
    (row) => row.parentId === null && ((row.code && codes.has(row.code)) || (row.nameEn != null && names.has(row.nameEn))),
  );
}

export async function listGovernedRootSectors(client?: PrismaLike) {
  const rows = await ensureGovernedCoreSectors(client);
  const codes = new Set(CORE_COMMERCIAL_SECTOR_BOOTSTRAP.map((s) => s.code));
  const preferred = rows.filter((row) => row.parentId === null && row.code && codes.has(row.code));
  return (preferred.length ? preferred : rows.filter((row) => row.parentId === null)).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
  }));
}

export async function listCompanyInstalledSectors(companyId: string, client?: PrismaLike) {
  const db = client ?? (await defaultClient());
  const rows = await sectors(db).findMany({
    where: { companyId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}

export async function collectCategoryTreeIds(rootIds: string[], client?: PrismaLike): Promise<string[]> {
  const db = client ?? (await defaultClient());
  const ids = new Set(rootIds);
  let frontier = [...rootIds];
  while (frontier.length) {
    const children = await db.universalCategory.findMany({
      where: { parentId: { in: frontier }, isActive: true },
      select: { id: true },
    });
    frontier = children.map((child) => child.id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }
  return [...ids];
}

export async function replaceCompanyInstalledSectors(companyId: string, categoryIds: string[], client?: PrismaLike) {
  const db = client ?? (await defaultClient());
  const validated = validateInstalledCategoryIds(categoryIds);
  if (!validated.ok) return validated;
  const roots = await listGovernedRootSectors(db);
  const allowed = new Set(roots.map((row) => row.id));
  if (validated.ids.some((id) => !allowed.has(id))) {
    return { ok: false as const, error: "UNIVERSAL_LIBRARY_SECTOR_INVALID" as const };
  }
  await db.$transaction(async (tx) => {
    const txSectors = sectors(tx);
    await txSectors.deleteMany({ where: { companyId } });
    for (const categoryId of validated.ids) {
      await txSectors.create({
        data: { companyId, categoryId, isActive: true },
      });
    }
  });
  return { ok: true as const, ids: validated.ids };
}

export { MAX_COMPANY_UNIVERSAL_LIBRARY_SECTORS };
