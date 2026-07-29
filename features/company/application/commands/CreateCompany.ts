import {
  DomainError,
  Result,
  type Service,
} from '../../../../lib/core';

import {
  Company,
  type CompanyLocale,
} from '../../domain/entities';

import type { CompanyRepository } from '../../domain/repositories';

export type CreateCompanyInput = {
  name: string;
  slug?: string;
  defaultLocale?: CompanyLocale;
  defaultCurrency?: string;
  timezone?: string;
};

export class CreateCompany
  implements
    Service<
      CreateCompanyInput,
      Result<Company, DomainError>
    >
{
  constructor(
    private readonly companyRepository: CompanyRepository,
  ) {}

  public async execute(
    input: CreateCompanyInput,
  ): Promise<Result<Company, DomainError>> {
    const companyResult = Company.create(input);

    if (!companyResult.isSuccess) {
      return Result.failure(companyResult.getError());
    }

    const company = companyResult.getValue();

    const existingCompany =
      await this.companyRepository.findBySlug(
        company.slug,
      );

    if (existingCompany) {
      return Result.failure(
        new DomainError(
          'A company with this slug already exists.',
          'COMPANY_SLUG_ALREADY_EXISTS',
        ),
      );
    }

    const savedCompany =
      await this.companyRepository.save(company);

    return Result.success(savedCompany);
  }
}
