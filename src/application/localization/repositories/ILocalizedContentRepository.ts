import type { LocalizedContent } from "../../../domain/localization/entities/LocalizedContent";
import type { LocalizedContentStatus } from "../../../domain/localization/types/LocalizedContentStatus";

export type UpsertLocalizedVariantParams = {
  companyId: string;
  resourceType: string;
  resourceId: string;
  fieldKey: string;
  locale: string;
  sourceLocale: string;
  text: string;
  status: LocalizedContentStatus;
  sourceHash?: string | null;
  provider?: string | null;
  model?: string | null;
  translatedAt?: Date | null;
};

export type InvalidateLocalizedFieldsParams = {
  companyId: string;
  resourceType: string;
  resourceId: string;
  fieldKeys?: string[];
  locales?: string[];
};

export interface ILocalizedContentRepository {
  upsertVariant(params: UpsertLocalizedVariantParams): Promise<LocalizedContent>;
  upsertManyVariants(params: UpsertLocalizedVariantParams[]): Promise<LocalizedContent[]>;
  findByResourceAndLocale(params: {
    companyId: string;
    resourceType: string;
    resourceId: string;
    locale: string;
  }): Promise<LocalizedContent[]>;
  findByFieldAndLocale(params: {
    companyId: string;
    resourceType: string;
    resourceId: string;
    fieldKey: string;
    locale: string;
  }): Promise<LocalizedContent | null>;
  invalidateFields(params: InvalidateLocalizedFieldsParams): Promise<number>;
}
