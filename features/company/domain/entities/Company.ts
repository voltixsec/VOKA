import {
  DomainError,
  Entity,
  Guard,
  Result,
  UniqueEntityID,
} from '../../../../lib/core';

export type CompanyLocale = 'EN' | 'AR';

export type CompanyBrandTheme =
  | 'NAVY_GOLD'
  | 'ROYAL_BLUE'
  | 'EMERALD'
  | 'BURGUNDY'
  | 'CHARCOAL';

export type CompanyProps = {
  name: string;

  nameAr?: string | null;
  nameEn?: string | null;

  addressAr?: string | null;
  addressEn?: string | null;

  poBox?: string | null;
  phone?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;

  logoUrl?: string | null;
  letterheadUrl?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  brandTheme: CompanyBrandTheme;

  slug: string;
  defaultLocale: CompanyLocale;
  defaultCurrency: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCompanyProps = {
  name: string;

  nameAr?: string | null;
  nameEn?: string | null;

  addressAr?: string | null;
  addressEn?: string | null;

  poBox?: string | null;
  phone?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;

  logoUrl?: string | null;
  letterheadUrl?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  brandTheme?: CompanyBrandTheme;

  slug?: string;
  defaultLocale?: CompanyLocale;
  defaultCurrency?: string;
  timezone?: string;
};

export class Company extends Entity<CompanyProps> {
  private constructor(props: CompanyProps, id?: UniqueEntityID) {
    super(props, id);
  }

  public get name(): string {
    return this.props.name;
  }

  public get nameAr(): string | null {
    return this.props.nameAr ?? null;
  }

  public get nameEn(): string | null {
    return this.props.nameEn ?? null;
  }

  public get addressAr(): string | null {
    return this.props.addressAr ?? null;
  }

  public get addressEn(): string | null {
    return this.props.addressEn ?? null;
  }

  public get poBox(): string | null {
    return this.props.poBox ?? null;
  }

  public get phone(): string | null {
    return this.props.phone ?? null;
  }

  public get mobile(): string | null {
    return this.props.mobile ?? null;
  }

  public get whatsapp(): string | null {
    return this.props.whatsapp ?? null;
  }

  public get logoUrl(): string | null {
    return this.props.logoUrl ?? null;
  }

  public get letterheadUrl(): string | null { return this.props.letterheadUrl ?? null; }
  public get signatureUrl(): string | null { return this.props.signatureUrl ?? null; }
  public get stampUrl(): string | null { return this.props.stampUrl ?? null; }

  public displayName(
    locale: CompanyLocale,
  ): string {
    if (locale === 'AR') {
      return (
        this.nameAr ||
        this.nameEn ||
        this.name
      );
    }

    return (
      this.nameEn ||
      this.nameAr ||
      this.name
    );
  }

  public displayAddress(
    locale: CompanyLocale,
  ): string | null {
    if (locale === 'AR') {
      return (
        this.addressAr ||
        this.addressEn
      );
    }

    return (
      this.addressEn ||
      this.addressAr
    );
  }

  public get slug(): string {
    return this.props.slug;
  }

  public get defaultLocale(): CompanyLocale {
    return this.props.defaultLocale;
  }

  public get brandTheme(): CompanyBrandTheme {
    return this.props.brandTheme;
  }

  public get defaultCurrency(): string {
    return this.props.defaultCurrency;
  }

  public get timezone(): string {
    return this.props.timezone;
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
    input: CreateCompanyProps,
    id?: UniqueEntityID,
  ): Result<Company, DomainError> {
    const name = input.name.trim();

    const nameGuard = Guard.againstEmptyString(name, 'Company name');

    if (!nameGuard.succeeded) {
      return Result.failure(
        new DomainError(
          nameGuard.message ?? 'Company name is required.',
          'INVALID_COMPANY_NAME',
        ),
      );
    }

    const slug = Company.normalizeSlug(input.slug ?? name);

    if (!slug) {
      return Result.failure(
        new DomainError(
          'Company slug is invalid.',
          'INVALID_COMPANY_SLUG',
        ),
      );
    }

    const currency = (
      input.defaultCurrency ?? 'KWD'
    ).trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      return Result.failure(
        new DomainError(
          'Company currency must be a valid three-letter currency code.',
          'INVALID_COMPANY_CURRENCY',
        ),
      );
    }

    const now = new Date();

    return Result.success(
      new Company(
        {
          name,

          nameAr: Company.normalizeOptional(
            input.nameAr,
          ),

          nameEn: Company.normalizeOptional(
            input.nameEn,
          ),

          addressAr: Company.normalizeOptional(
            input.addressAr,
          ),

          addressEn: Company.normalizeOptional(
            input.addressEn,
          ),

          poBox: Company.normalizeOptional(
            input.poBox,
          ),

          phone: Company.normalizeOptional(
            input.phone,
          ),

          mobile: Company.normalizeOptional(
            input.mobile,
          ),

          whatsapp: Company.normalizeOptional(
            input.whatsapp,
          ),

          logoUrl: Company.normalizeOptional(
            input.logoUrl,
          ),
          letterheadUrl: Company.normalizeOptional(input.letterheadUrl),
          signatureUrl: Company.normalizeOptional(input.signatureUrl),
          stampUrl: Company.normalizeOptional(input.stampUrl),

          slug,
          defaultLocale: input.defaultLocale ?? 'EN',
          brandTheme: input.brandTheme ?? 'NAVY_GOLD',
          defaultCurrency: currency,
          timezone: input.timezone?.trim() || 'Asia/Kuwait',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        id,
      ),
    );
  }

  public static restore(
    props: CompanyProps,
    id: UniqueEntityID,
  ): Company {
    return new Company(props, id);
  }

  public rename(name: string): Result<void, DomainError> {
    const normalizedName = name.trim();
    const guard = Guard.againstEmptyString(
      normalizedName,
      'Company name',
    );

    if (!guard.succeeded) {
      return Result.failure(
        new DomainError(
          guard.message ?? 'Company name is required.',
          'INVALID_COMPANY_NAME',
        ),
      );
    }

    this.props.name = normalizedName;
    this.touch();

    return Result.success(undefined);
  }

  public updateIdentity(
    input: {
      nameAr?: string | null;
      nameEn?: string | null;

      addressAr?: string | null;
      addressEn?: string | null;

      poBox?: string | null;
      phone?: string | null;
      mobile?: string | null;
      whatsapp?: string | null;

      logoUrl?: string | null;
      letterheadUrl?: string | null;
      signatureUrl?: string | null;
      stampUrl?: string | null;
    },
  ): void {
    const fields = [
      'nameAr',
      'nameEn',
      'addressAr',
      'addressEn',
      'poBox',
      'phone',
      'mobile',
      'whatsapp',
      'logoUrl',
      'letterheadUrl',
      'signatureUrl',
      'stampUrl',
    ] as const;

    for (const field of fields) {
      if (
        input[field] !==
        undefined
      ) {
        this.props[field] =
          Company.normalizeOptional(
            input[field],
          );
      }
    }

    this.touch();
  }

  public changeBrandTheme(
    theme: CompanyBrandTheme,
  ): void {
    this.props.brandTheme =
      theme;

    this.touch();
  }
  public changeDefaultCurrency(
    currency: string,
  ): Result<void, DomainError> {
    const normalizedCurrency =
      currency
        .trim()
        .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        normalizedCurrency,
      )
    ) {
      return Result.failure(
        new DomainError(
          "Company currency must be a valid three-letter currency code.",
          "INVALID_COMPANY_CURRENCY",
        ),
      );
    }

    this.props.defaultCurrency =
      normalizedCurrency;

    this.touch();

    return Result.success(
      undefined,
    );
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
    value:
      | string
      | null
      | undefined,
  ): string | null {
    return (
      value?.trim() ||
      null
    );
  }

  private static normalizeSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
