import {
  DomainError,
  Entity,
  Guard,
  Result,
  UniqueEntityID,
} from '../../../../lib/core';

export type CompanyRole =
  | 'OWNER'
  | 'ADMIN'
  | 'SALES'
  | 'VIEWER';

export type MembershipStatus =
  | 'ACTIVE'
  | 'INVITED'
  | 'SUSPENDED';

export type CompanyMemberProps = {
  companyId: string;
  userId: string;
  role: CompanyRole;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCompanyMemberProps = {
  companyId: string;
  userId: string;
  role?: CompanyRole;
  status?: MembershipStatus;
};

export class CompanyMember extends Entity<CompanyMemberProps> {
  private constructor(
    props: CompanyMemberProps,
    id?: UniqueEntityID,
  ) {
    super(props, id);
  }

  public get companyId(): string {
    return this.props.companyId;
  }

  public get userId(): string {
    return this.props.userId;
  }

  public get role(): CompanyRole {
    return this.props.role;
  }

  public get status(): MembershipStatus {
    return this.props.status;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public get isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }

  public static create(
    input: CreateCompanyMemberProps,
    id?: UniqueEntityID,
  ): Result<CompanyMember, DomainError> {
    const companyId = input.companyId.trim();
    const userId = input.userId.trim();

    const companyIdGuard = Guard.againstEmptyString(
      companyId,
      'Company ID',
    );

    if (!companyIdGuard.succeeded) {
      return Result.failure(
        new DomainError(
          companyIdGuard.message ??
            'Company ID is required.',
          'INVALID_COMPANY_ID',
        ),
      );
    }

    const userIdGuard = Guard.againstEmptyString(
      userId,
      'User ID',
    );

    if (!userIdGuard.succeeded) {
      return Result.failure(
        new DomainError(
          userIdGuard.message ??
            'User ID is required.',
          'INVALID_USER_ID',
        ),
      );
    }

    const now = new Date();

    return Result.success(
      new CompanyMember(
        {
          companyId,
          userId,
          role: input.role ?? 'SALES',
          status: input.status ?? 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        id,
      ),
    );
  }

  public static restore(
    props: CompanyMemberProps,
    id: UniqueEntityID,
  ): CompanyMember {
    return new CompanyMember(props, id);
  }

  public changeRole(
    role: CompanyRole,
  ): Result<void, DomainError> {
    if (
      this.props.status === 'SUSPENDED'
    ) {
      return Result.failure(
        new DomainError(
          'A suspended membership role cannot be changed.',
          'SUSPENDED_MEMBERSHIP_ROLE_CHANGE_FORBIDDEN',
        ),
      );
    }

    this.props.role = role;
    this.touch();

    return Result.success(undefined);
  }

  public activate(): void {
    this.props.status = 'ACTIVE';
    this.touch();
  }

  public invite(): void {
    this.props.status = 'INVITED';
    this.touch();
  }

  public suspend(): void {
    this.props.status = 'SUSPENDED';
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
