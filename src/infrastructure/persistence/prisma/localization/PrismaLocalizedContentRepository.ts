import { prisma } from "../../../../../lib/prisma";
import { LocalizedContent } from "../../../../domain/localization/entities/LocalizedContent";
import { LocalizedContentStatus } from "../../../../domain/localization/types/LocalizedContentStatus";
import type {
  ILocalizedContentRepository,
  UpsertLocalizedVariantParams,
  InvalidateLocalizedFieldsParams,
} from "../../../../application/localization/repositories/ILocalizedContentRepository";

type LocalizedContentPrismaRecord = {
  id: string;
  companyId: string | null;
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
    const companyId = params.companyId ?? null;
    const record = await this.db.localizedContent.upsert({
      where: {
        companyId_resourceType_resourceId_fieldKey_locale: {
          companyId: companyId as any,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          fieldKey: params.fieldKey,
          locale: params.locale,
        },
      },
      create: {
        companyId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        fieldKey: params.fieldKey,
        locale: params.locale,
        sourceLocale: params.sourceLocale,
        text: params.text,
        status: params.status,
        sourceHash: params.sourceHash ?? null,
        provider: params.provider ?? null,
        model: params.model ?? null,
        translatedAt: params.translatedAt ?? new Date(),
      },
      update: {
        sourceLocale: params.sourceLocale,
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
    companyId?: string | null;
    resourceType: string;
    resourceId: string;
    locale: string;
  }): Promise<LocalizedContent[]> {
    const companyId = params.companyId === undefined ? null : params.companyId;
    const records = await this.db.localizedContent.findMany({
      where: {
        companyId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        locale: params.locale,
      },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByFieldAndLocale(params: {
    companyId?: string | null;
    resourceType: string;
    resourceId: string;
    fieldKey: string;
    locale: string;
  }): Promise<LocalizedContent | null> {
    const companyId = params.companyId === undefined ? null : params.companyId;
    const record = await this.db.localizedContent.findFirst({
      where: {
        companyId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        fieldKey: params.fieldKey,
        locale: params.locale,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  async invalidateFields(params: InvalidateLocalizedFieldsParams): Promise<number> {
    const companyId = params.companyId === undefined ? null : params.companyId;
    const where: any = {
      companyId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    };

    if (params.fieldKeys && params.fieldKeys.length > 0) {
      where.fieldKey = { in: params.fieldKeys };
    }

    if (params.locales && params.locales.length > 0) {
      where.locale = { in: params.locales };
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
