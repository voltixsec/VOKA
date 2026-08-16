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
  nameAr: string | null;
  nameEn: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
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
  nameAr?: string | null;
  nameEn?: string | null;
  categoryId?: string | null;
  unitId?: string | null;
  taxRateId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
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

  public get nameAr(): string | null {
    return this.props.nameAr;
  }

  public get nameEn(): string | null {
    return this.props.nameEn;
  }

  public get description(): string | null {
    return this.props.description;
  }

  public get descriptionAr(): string | null {
    return this.props.descriptionAr;
  }

  public get descriptionEn(): string | null {
    return this.props.descriptionEn;
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
          nameAr: CatalogItem.normalizeOptional(input.nameAr),
          nameEn: CatalogItem.normalizeOptional(input.nameEn),
          description: CatalogItem.normalizeOptional(
            input.description,
          ),
          descriptionAr: CatalogItem.normalizeOptional(
            input.descriptionAr,
          ),
          descriptionEn: CatalogItem.normalizeOptional(
            input.descriptionEn,
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

  public updateDetails(input: {
    name?: string;
    nameAr?: string | null;
    nameEn?: string | null;
    description?: string | null;
    descriptionAr?: string | null;
    descriptionEn?: string | null;
    unitId?: string | null;
    taxRateId?: string | null;
    categoryId?: string | null;
    sku?: string | null;
    barcode?: string | null;
    salePrice?: number;
    purchasePrice?: number | null;
    trackInventory?: boolean;
    allowDiscount?: boolean;
    isActive?: boolean;
  }): Result<void, DomainError> {
    if (input.name !== undefined) {
      const normalizedName = input.name.trim();
      if (!normalizedName) {
        return Result.failure(
          new DomainError('Catalog item name is required.', 'INVALID_CATALOG_ITEM_NAME'),
        );
      }
      this.props.name = normalizedName;
    }

    if (input.nameAr !== undefined) {
      this.props.nameAr = CatalogItem.normalizeOptional(input.nameAr);
    }
    if (input.nameEn !== undefined) {
      this.props.nameEn = CatalogItem.normalizeOptional(input.nameEn);
    }
    if (input.description !== undefined) {
      this.props.description = CatalogItem.normalizeOptional(input.description);
    }
    if (input.descriptionAr !== undefined) {
      this.props.descriptionAr = CatalogItem.normalizeOptional(input.descriptionAr);
    }
    if (input.descriptionEn !== undefined) {
      this.props.descriptionEn = CatalogItem.normalizeOptional(input.descriptionEn);
    }
    if (input.unitId !== undefined) {
      this.props.unitId = CatalogItem.normalizeOptional(input.unitId);
    }
    if (input.taxRateId !== undefined) {
      this.props.taxRateId = CatalogItem.normalizeOptional(input.taxRateId);
    }
    if (input.categoryId !== undefined) {
      this.props.categoryId = CatalogItem.normalizeOptional(input.categoryId);
    }
    if (input.sku !== undefined) {
      this.props.sku = CatalogItem.normalizeOptional(input.sku);
    }
    if (input.barcode !== undefined) {
      this.props.barcode = CatalogItem.normalizeOptional(input.barcode);
    }
    if (input.salePrice !== undefined) {
      if (!Number.isFinite(input.salePrice) || input.salePrice < 0) {
        return Result.failure(
          new DomainError('Catalog item sale price must be a non-negative number.', 'INVALID_CATALOG_ITEM_SALE_PRICE'),
        );
      }
      this.props.salePrice = input.salePrice;
    }
    if (input.purchasePrice !== undefined) {
      if (input.purchasePrice !== null && (!Number.isFinite(input.purchasePrice) || input.purchasePrice < 0)) {
        return Result.failure(
          new DomainError('Catalog item purchase price must be a non-negative number.', 'INVALID_CATALOG_ITEM_PURCHASE_PRICE'),
        );
      }
      this.props.purchasePrice = input.purchasePrice;
    }
    if (input.trackInventory !== undefined) {
      this.props.trackInventory = this.props.type === 'SERVICE' ? false : input.trackInventory;
    }
    if (input.allowDiscount !== undefined) {
      this.props.allowDiscount = input.allowDiscount;
    }
    if (input.isActive !== undefined) {
      this.props.isActive = input.isActive;
    }

    this.touch();
    return Result.success(undefined);
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