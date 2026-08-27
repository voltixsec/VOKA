import type { PrismaClient } from '../../lib/generated/prisma/client';

export type CatalogLocalizationInput = {
  locale: string;
  name: string;
  description?: string | null;
};

export type CatalogLocalizationView = CatalogLocalizationInput & {
  source: 'HUMAN' | 'GOVERNED' | 'LEGACY';
};

export function normalizeLocale(locale: string | null | undefined): string {
  const normalized = locale?.trim().toLowerCase().replace('_', '-');
  return normalized && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)
    ? normalized
    : 'en';
}

export function resolveCatalogText(
  canonical: { name: string; description: string | null },
  localizations: CatalogLocalizationView[],
  requestedLocale: string,
) {
  const locale = normalizeLocale(requestedLocale);
  const exact = localizations.find((entry) => entry.locale === locale);
  const language = localizations.find(
    (entry) => entry.locale === locale.split('-')[0],
  );
  const resolved = exact ?? language;

  return {
    name: resolved?.name ?? canonical.name,
    description: resolved?.description ?? canonical.description,
    requestedLocale: locale,
    resolvedLocale: resolved?.locale ?? null,
    isFallback: !resolved,
  };
}

export async function saveHumanCatalogLocalizations(
  prisma: PrismaClient,
  companyId: string,
  catalogItemId: string,
  inputs: CatalogLocalizationInput[],
) {
  const item = await prisma.catalogItem.findFirst({
    where: { id: catalogItemId, companyId },
    select: { id: true },
  });
  if (!item) throw new Error('Catalog item not found for active company.');

  const normalized = inputs.map((input) => ({
    locale: normalizeLocale(input.locale),
    name: input.name.trim(),
    description: input.description?.trim() || null,
  })).filter((input) => input.name);

  await prisma.$transaction(
    normalized.map((input) => prisma.catalogItemLocalization.upsert({
      where: {
        catalogItemId_locale: {
          catalogItemId,
          locale: input.locale,
        },
      },
      create: {
        companyId,
        catalogItemId,
        ...input,
        source: 'HUMAN',
      },
      update: {
        name: input.name,
        description: input.description,
        source: 'HUMAN',
      },
    })),
  );
}

export async function getCatalogLocalizations(
  prisma: PrismaClient,
  companyId: string,
  catalogItemIds: string[],
): Promise<Map<string, CatalogLocalizationView[]>> {
  const rows = await prisma.catalogItemLocalization.findMany({
    where: { companyId, catalogItemId: { in: catalogItemIds } },
    orderBy: [{ locale: 'asc' }],
  });
  const grouped = new Map<string, CatalogLocalizationView[]>();
  for (const row of rows) {
    const list = grouped.get(row.catalogItemId) ?? [];
    list.push({
      locale: row.locale,
      name: row.name,
      description: row.description,
      source: row.source,
    });
    grouped.set(row.catalogItemId, list);
  }
  return grouped;
}
