import {
  DomainError,
  Entity,
  Guard,
  Result,
  UniqueEntityID,
} from '../../../../lib/core';

export type UnitProps = {
  companyId: string | null;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  symbol: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUnitProps = {
  companyId?: string | null;
  name: string;
  symbol: string;
  nameAr?: string | null;
  nameEn?: string | null;
  isActive?: boolean;
};

export class Unit extends Entity<UnitProps> {
  private constructor(
    props: UnitProps,
    id?: UniqueEntityID,
  ) {
    super(props, id);
  }

  public get companyId(): string | null {
    return this.props.companyId;
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

  public get symbol(): string {
    return this.props.symbol;
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
    input: CreateUnitProps,
    id?: UniqueEntityID,
  ): Result<Unit, DomainError> {
    const name = input.name.trim();
    const symbol = input.symbol.trim();

    const nameGuard = Guard.againstEmptyString(name, 'Unit name');
    if (!nameGuard.succeeded) {
      return Result.failure(
        new DomainError(
          nameGuard.message ?? 'Unit name is required.',
          'INVALID_UNIT_NAME',
        ),
      );
    }

    const symbolGuard = Guard.againstEmptyString(symbol, 'Unit symbol');
    if (!symbolGuard.succeeded) {
      return Result.failure(
        new DomainError(
          symbolGuard.message ?? 'Unit symbol is required.',
          'INVALID_UNIT_SYMBOL',
        ),
      );
    }

    const now = new Date();

    return Result.success(
      new Unit(
        {
          companyId: input.companyId ? input.companyId.trim() : null,
          name,
          nameAr: input.nameAr ? input.nameAr.trim() : null,
          nameEn: input.nameEn ? input.nameEn.trim() : null,
          symbol,
          isActive: input.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        },
        id,
      ),
    );
  }

  public static restore(
    props: UnitProps,
    id: UniqueEntityID,
  ): Unit {
    return new Unit(props, id);
  }
}
