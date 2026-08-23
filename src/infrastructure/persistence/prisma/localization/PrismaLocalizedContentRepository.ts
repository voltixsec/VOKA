import { prisma } from "../../../../../lib/prisma";
import { LocalizedContent } from "../../../../domain/localization/entities/LocalizedContent";
import { LocalizedContentStatus } from "../../../../domain/localization/types/LocalizedContentStatus";
import {
  isValidLocale,
  normalizeLocale,
} from "../../../../application/translation/ports/TranslationPort";
import type {
  ILocalizedContentRepository,
  UpsertLocalizedVariantParams,
  InvalidateLocalizedFieldsParams,
} from "../../../../application/localization/repositories/ILocalizedContentRepository";

type LocalizedContentPrismaRecord = {
  id: string;
  companyId: string;
  resourceType: string;
  resourceId: string;
  fieldKey: string;
  locale: string;
  sourceLocale: string;
  text: string;
  status: string;
  sourceHash: string | null;
  provider: string | null;
  model: string | null;
  translatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaLocalizedContentRepository implements ILocalizedContentRepository {
  constructor(private readonly db = prisma) {}

  private toDomain(record: LocalizedContentPrismaRecord): LocalizedContent {
    return new LocalizedContent({
      id: record.id,
      companyId: record.companyId,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      fieldKey: record.fieldKey,
      locale: record.locale,
      sourceLocale: record.sourceLocale,
      text: record.text,
      status: record.status as LocalizedContentStatus,
      sourceHash: record.sourceHash,
      provider: record.provider,
      model: record.model,
      translatedAt: record.translatedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async upsertVariant(params: UpsertLocalizedVariantParams): Promise<LocalizedContent> {
    if (!isValidLocale(params.locale)) {
      throw new Error(`Invalid target locale: "${params.locale}"`);
    }
    if (!isValidLocale(params.sourceLocale)) {
      throw new Error(`Invalid source locale: "${params.sourceLocale}"`);
    }

    const canonicalLocale = normalizeLocale(params.locale);
    const canonicalSourceLocale = normalizeLocale(params.sourceLocale);

    const record = await this.db.localizedContent.upsert({
      where: {
        companyId_resourceType_resourceId_fieldKey_locale: {
          companyId: params.companyId,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          fieldKey: params.fieldKey,
          locale: canonicalLocale,
        },
      },
      create: {
        companyId: params.companyId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        fieldKey: params.fieldKey,
        locale: canonicalLocale,
        sourceLocale: canonicalSourceLocale,
        text: params.text,
        status: params.status,
        sourceHash: params.sourceHash ?? null,
        provider: params.provider ?? null,
        model: params.model ?? null,
        translatedAt: params.translatedAt ?? new Date(),
      },
      update: {
        sourceLocale: canonicalSourceLocale,
        text: params.text,
        status: params.status,
        sourceHash: params.sourceHash ?? null,
        provider: params.provider ?? null,
        model: params.model ?? null,
        translatedAt: params.translatedAt ?? new Date(),
      },
    });

    return this.toDomain(record);
  }

  async upsertManyVariants(params: UpsertLocalizedVariantParams[]): Promise<LocalizedContent[]> {
    const results: LocalizedContent[] = [];
    for (const p of params) {
      results.push(await this.upsertVariant(p));
    }
    return results;
  }

  async findByResourceAndLocale(params: {
    companyId: string;
    resourceType: string;
    resourceId: string;
    locale: string;
  }): Promise<LocalizedContent[]> {
    if (!isValidLocale(params.locale)) {
      throw new Error(`Invalid locale: "${params.locale}"`);
    }
    const canonicalLocale = normalizeLocale(params.locale);

    const records = await this.db.localizedContent.findMany({
      where: {
        companyId: params.companyId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        locale: canonicalLocale,
      },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByFieldAndLocale(params: {
    companyId: string;
    resourceType: string;
    resourceId: string;
    fieldKey: string;
    locale: string;
  }): Promise<LocalizedContent | null> {
    if (!isValidLocale(params.locale)) {
      throw new Error(`Invalid locale: "${params.locale}"`);
    }
    const canonicalLocale = normalizeLocale(params.locale);

    const record = await this.db.localizedContent.findFirst({
      where: {
        companyId: params.companyId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        fieldKey: params.fieldKey,
        locale: canonicalLocale,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  async invalidateFields(params: InvalidateLocalizedFieldsParams): Promise<number> {
    const where: any = {
      companyId: params.companyId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    };

    if (params.fieldKeys && params.fieldKeys.length > 0) {
      where.fieldKey = { in: params.fieldKeys };
    }

    if (params.locales && params.locales.length > 0) {
      const canonicalLocales = params.locales.map((loc) => {
        if (!isValidLocale(loc)) {
          throw new Error(`Invalid locale for invalidation: "${loc}"`);
        }
        return normalizeLocale(loc);
      });
      where.locale = { in: canonicalLocales };
    }

    const res = await this.db.localizedContent.updateMany({
      where,
      data: {
        status: LocalizedContentStatus.STALE,
      },
    });

    return res.count;
  }
}
