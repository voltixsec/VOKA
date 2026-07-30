import type { Service } from '../../../../lib/core';

import type {
  Customer,
  CustomerStatus,
  CustomerType,
} from '../../domain/entities';

import type { CustomerRepository } from '../../domain/repositories';

export type ListCustomersInput = {
  companyId: string;
  search?: string;
  status?: CustomerStatus;
  type?: CustomerType;
  includeDeleted?: boolean;
  page?: number;
  pageSize?: number;
};

export type ListCustomersOutput = {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export class ListCustomers
  implements
    Service<
      ListCustomersInput,
      ListCustomersOutput
    >
{
  constructor(
    private readonly customerRepository: CustomerRepository,
  ) {}

  public async execute(
    input: ListCustomersInput,
  ): Promise<ListCustomersOutput> {
    const page = this.normalizePage(input.page);
    const pageSize = this.normalizePageSize(
      input.pageSize,
    );

    const filters = {
      companyId: input.companyId,
      search: input.search?.trim() || undefined,
      status: input.status,
      type: input.type,
      includeDeleted: input.includeDeleted ?? false,
      skip: (page - 1) * pageSize,
      take: pageSize,
    };

    const [customers, total] = await Promise.all([
      this.customerRepository.findAll(filters),
      this.customerRepository.count(filters),
    ]);

    return {
      customers,
      total,
      page,
      pageSize,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(total / pageSize),
    };
  }

  private normalizePage(page?: number): number {
    if (
      page === undefined ||
      !Number.isInteger(page) ||
      page < 1
    ) {
      return 1;
    }

    return page;
  }

  private normalizePageSize(
    pageSize?: number,
  ): number {
    if (
      pageSize === undefined ||
      !Number.isInteger(pageSize) ||
      pageSize < 1
    ) {
      return 20;
    }

    return Math.min(pageSize, 100);
  }
}
