import type { QuotationStatus } from "../../../domain/quotation";

import type { IQuotationRepository } from "../repositories/IQuotationRepository";

export type ListQuotationsDto = {
  companyId: string;
  status?: QuotationStatus;
  customerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ListQuotationsResult = {
  quotations: Awaited<
    ReturnType<IQuotationRepository["findAll"]>
  >["quotations"];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

export class ListQuotationsUseCase {
  constructor(
    private readonly repository: IQuotationRepository,
  ) {}

  async execute(
    dto: ListQuotationsDto,
  ): Promise<ListQuotationsResult> {
    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(
      100,
      Math.max(1, dto.pageSize ?? 20),
    );
    const result = await this.repository.findAll({
      companyId: dto.companyId,
      status: dto.status,
      customerId: dto.customerId,
      search: dto.search,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      quotations: result.quotations,
      pagination: {
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }
}
