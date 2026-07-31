import {
  DomainError,
  Entity,
  Guard,
  Result,
  UniqueEntityID,
} from '../../../../lib/core';

export type CatalogItemType =
  | 'PRODUCT'
  | 'SERVICE'
  | 'SHIPPING'
  | 'LABOR'
  | 'DISCOUNT'
  | 'CUSTOM';

export type CatalogItemProps = {
  companyId: string;
  categoryId: string | null;
  unitId: string | null;
  taxRateId: string | null;
  type: CatalogItemType;
  code: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  purchasePrice: number | null;
  salePrice: number;
  trackInventory: boolean;
  allowDiscount: boolean;
  imageUrl: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCatalogItemProps = {
  companyId: string;
  type: CatalogItemType;
  code: string;
  name: string;
  salePrice: number;
  categoryId?: string | null;
  unitId?: string | null;
  taxRateId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  purchasePrice?: number | null;
  trackInventory?: boolean;
  allowDiscount?: boolean;
  imageUrl?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export class CatalogItem extends Entity<CatalogItemProps> {
  private constructor(
    props: CatalogItemProps,
    id?: UniqueEntityID,
  ) {
    super(props, id);
  }

  public get companyId(): string {
    return this.props.companyId;
  }

  public get categoryId(): string | null {
    return this.props.categoryId;
  }

  public get unitId(): string | null {
    return this.props.unitId;
  }

  public get taxRateId(): string | null {
    return this.props.taxRateId;
  }

  public get type(): CatalogItemType {
    return this.props.type;
  }

  public get code(): string {
    return this.props.code;
  }

  public get sku(): string | null {
    return this.props.sku;
  }

  public get barcode(): string | null {
    return this.props.barcode;
  }

  public get name(): string {
    return this.props.name;
  }

  public get description(): string | null {
    return this.props.description;
  }

  public get purchasePrice(): number | null {
    return this.props.purchasePrice;
  }

  public get salePrice(): number {
    return this.props.salePrice;
  }

  public get trackInventory(): boolean {
    return this.props.trackInventory;
  }

  public get allowDiscount(): boolean {
    return this.props.allowDiscount;
  }

  public get imageUrl(): string | null {
    return this.props.imageUrl;
  }

  public get notes(): string | null {
    return this.props.notes;
  }

  public get isActive(): boolean {
    return this.props.isActive;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public static create(
    input: CreateCatalogItemProps,
    id?: UniqueEntityID,
  ): Result<CatalogItem, DomainError> {
    const companyId = input.companyId.trim();
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();

    const companyGuard = Guard.againstEmptyString(
      companyId,
      'Catalog item company ID',
    );

    if (!companyGuard.succeeded) {
      return Result.failure(
        new DomainError(
          companyGuard.message ??
            'Catalog item company ID is required.',
          'INVALID_CATALOG_ITEM_COMPANY_ID',
        ),
      );
    }

    const codeGuard = Guard.againstEmptyString(
      code,
      'Catalog item code',
    );

    if (!codeGuard.succeeded) {
      return Result.failure(
        new DomainError(
          codeGuard.message ?? 'Catalog item code is required.',
          'INVALID_CATALOG_ITEM_CODE',
        ),
      );
    }

    if (!/^[A-Z0-9][A-Z0-9-_]{0,49}$/.test(code)) {
      return Result.failure(
        new DomainError(
          'Catalog item code may only contain letters, numbers, hyphens, and underscores.',
          'INVALID_CATALOG_ITEM_CODE',
        ),
      );
    }

    const nameGuard = Guard.againstEmptyString(
      name,
      'Catalog item name',
    );

    if (!nameGuard.succeeded) {
      return Result.failure(
        new DomainError(
          nameGuard.message ?? 'Catalog item name is required.',
          'INVALID_CATALOG_ITEM_NAME',
        ),
      );
    }

    if (
      !Number.isFinite(input.salePrice) ||
      input.salePrice < 0
    ) {
      return Result.failure(
        new DomainError(
          'Catalog item sale price must be a non-negative number.',
          'INVALID_CATALOG_ITEM_SALE_PRICE',
        ),
      );
    }

    if (
      input.purchasePrice !== undefined &&
      input.purchasePrice !== null &&
      (!Number.isFinite(input.purchasePrice) ||
        input.purchasePrice < 0)
    ) {
      return Result.failure(
        new DomainError(
          'Catalog item purchase price must be a non-negative number.',
          'INVALID_CATALOG_ITEM_PURCHASE_PRICE',
        ),
      );
    }

    const now = new Date();

    return Result.success(
      new CatalogItem(
        {
          companyId,
          categoryId: CatalogItem.normalizeOptional(
            input.categoryId,
          ),
          unitId: CatalogItem.normalizeOptional(input.unitId),
          taxRateId: CatalogItem.normalizeOptional(
            input.taxRateId,
          ),
          type: input.type,
          code,
          sku: CatalogItem.normalizeOptional(input.sku),
          barcode: CatalogItem.normalizeOptional(input.barcode),
          name,
          description: CatalogItem.normalizeOptional(
            input.description,
          ),
          purchasePrice: input.purchasePrice ?? null,
          salePrice: input.salePrice,
          trackInventory:
            input.type === 'SERVICE'
              ? false
              : (input.trackInventory ?? true),
          allowDiscount: input.allowDiscount ?? true,
          imageUrl: CatalogItem.normalizeOptional(input.imageUrl),
          notes: CatalogItem.normalizeOptional(input.notes),
          isActive: input.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        },
        id,
      ),
    );
  }

  public static restore(
    props: CatalogItemProps,
    id: UniqueEntityID,
  ): CatalogItem {
    return new CatalogItem(props, id);
  }

  public rename(name: string): Result<void, DomainError> {
    const normalizedName = name.trim();
    const guard = Guard.againstEmptyString(
      normalizedName,
      'Catalog item name',
    );

    if (!guard.succeeded) {
      return Result.failure(
        new DomainError(
          guard.message ?? 'Catalog item name is required.',
          'INVALID_CATALOG_ITEM_NAME',
        ),
      );
    }

    this.props.name = normalizedName;
    this.touch();

    return Result.success(undefined);
  }

  public changeSalePrice(
    salePrice: number,
  ): Result<void, DomainError> {
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      return Result.failure(
        new DomainError(
          'Catalog item sale price must be a non-negative number.',
          'INVALID_CATALOG_ITEM_SALE_PRICE',
        ),
      );
    }

    this.props.salePrice = salePrice;
    this.touch();

    return Result.success(undefined);
  }

  public changePurchasePrice(
    purchasePrice: number | null,
  ): Result<void, DomainError> {
    if (
      purchasePrice !== null &&
      (!Number.isFinite(purchasePrice) || purchasePrice < 0)
    ) {
      return Result.failure(
        new DomainError(
          'Catalog item purchase price must be a non-negative number.',
          'INVALID_CATALOG_ITEM_PURCHASE_PRICE',
        ),
      );
    }

    this.props.purchasePrice = purchasePrice;
    this.touch();

    return Result.success(undefined);
  }

  public activate(): void {
    this.props.isActive = true;
    this.touch();
  }

  public deactivate(): void {
    this.props.isActive = false;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }

  private static normalizeOptional(
    value?: string | null,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : null;
  }
}