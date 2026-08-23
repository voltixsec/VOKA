import type { ILocalizedContentRepository } from "../repositories/ILocalizedContentRepository";
import { LocalizedContentStatus } from "../../../domain/localization/types/LocalizedContentStatus";
import {
  isValidLocale,
  normalizeLocale,
} from "../../translation/ports/TranslationPort";

export type GetLocalizedFieldParams = {
  companyId: string;
  resourceType: string;
  resourceId: string;
  fieldKey: string;
  requestedLocale: string;
  legacyValue?: string | null;
  sourceValue?: string | null;
  sourceHash?: string | null;
};

export class GetLocalizedContentUseCase {
  constructor(private readonly repository: ILocalizedContentRepository) {}

  async getField(params: GetLocalizedFieldParams): Promise<string | null> {
    if (isValidLocale(params.requestedLocale)) {
      const canonicalLocale = normalizeLocale(params.requestedLocale);

      const genericVariant = await this.repository.findByFieldAndLocale({
        companyId: params.companyId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        fieldKey: params.fieldKey,
        locale: canonicalLocale,
      });

      if (genericVariant && genericVariant.status === LocalizedContentStatus.VALID) {
        if (params.sourceHash && genericVariant.sourceHash) {
          if (genericVariant.sourceHash === params.sourceHash) {
            return genericVariant.text;
          }
        } else {
          return genericVariant.text;
        }
      }
    }

    if (params.legacyValue && params.legacyValue.trim()) {
      return params.legacyValue;
    }

    if (params.sourceValue && params.sourceValue.trim()) {
      return params.sourceValue;
    }

    return null;
  }
}
