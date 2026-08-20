import { AdoptUniversalItemResult, IUniversalLibraryRepository } from "../../domain";

export interface AdoptUniversalItemInput {
  companyId: string;
  universalItemId: string;
  adoptedByUserId?: string | null;
  code?: string;
  salePrice?: number;
  unitId?: string;
  taxRateId?: string;
}

export type AdoptUniversalItemError =
  | { code: "UNIVERSAL_ITEM_NOT_FOUND"; message: string }
  | { code: "UNIVERSAL_ITEM_INACTIVE"; message: string }
  | { code: "INVALID_TENANT_CONTEXT"; message: string };

export class AdoptUniversalItem {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  async execute(input: AdoptUniversalItemInput): Promise<{
    isSuccess: boolean;
    value?: AdoptUniversalItemResult;
    error?: AdoptUniversalItemError;
  }> {
    if (!input.companyId) {
      return {
        isSuccess: false,
        error: {
          code: "INVALID_TENANT_CONTEXT",
          message: "Authenticated company context is required.",
        },
      };
    }

    if (!input.universalItemId) {
      return {
        isSuccess: false,
        error: {
          code: "UNIVERSAL_ITEM_NOT_FOUND",
          message: "Universal item ID is required.",
        },
      };
    }

    const item = await this.repository.getItemById(input.universalItemId);
    if (!item) {
      return {
        isSuccess: false,
        error: {
          code: "UNIVERSAL_ITEM_NOT_FOUND",
          message: `Universal item '${input.universalItemId}' was not found.`,
        },
      };
    }

    if (!item.isActive) {
      return {
        isSuccess: false,
        error: {
          code: "UNIVERSAL_ITEM_INACTIVE",
          message: `Universal item '${input.universalItemId}' is inactive/deprecated and cannot be adopted.`,
        },
      };
    }

    const result = await this.repository.adoptItem({
      companyId: input.companyId,
      universalItemId: input.universalItemId,
      adoptedByUserId: input.adoptedByUserId,
      code: input.code,
      salePrice: input.salePrice,
      unitId: input.unitId,
      taxRateId: input.taxRateId,
    });

    return {
      isSuccess: true,
      value: result,
    };
  }
}
