import type { SalesOrderStatus } from "../../../domain/sales-order";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";

export type ListSalesOrdersDto = {
  companyId: string;
  status?: SalesOrderStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

export class ListSalesOrdersUseCase {
  constructor(
    private readonly repository: ISalesOrderRepository,
  ) {}

  async execute(dto: ListSalesOrdersDto) {
    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, dto.pageSize ?? 20));
    const result = await this.repository.findAll({
      companyId: dto.companyId,
      status: dto.status,
      search: dto.search,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      salesOrders: result.salesOrders,
      pagination: {
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }
}
