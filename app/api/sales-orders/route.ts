import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import { ListSalesOrdersUseCase } from "@/src/application/sales-order";
import { PrismaSalesOrderRepository } from "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository";
import { serializeSalesOrder } from "./serialize-sales-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository = new PrismaSalesOrderRepository();
const listSalesOrders = new ListSalesOrdersUseCase(repository);

function positiveInteger(
  value: string | null,
  fallback: number,
): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw ApiError.badRequest(
      "INVALID_PAGINATION",
      "Pagination values must be positive integers.",
    );
  }
  return parsed;
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const requestedLocale = params.get("locale");
    const locale = requestedLocale === "ar" || requestedLocale === "en"
      ? requestedLocale
      : undefined;

    if (status && status !== "DRAFT") {
      throw ApiError.badRequest(
        "INVALID_SALES_ORDER_STATUS",
        "Sales Order status is invalid.",
      );
    }

    const result = await listSalesOrders.execute({
      companyId: company.companyId,
      status: status === "DRAFT" ? status : undefined,
      search: params.get("search") ?? undefined,
      page: positiveInteger(params.get("page"), 1),
      pageSize: positiveInteger(params.get("pageSize"), 20),
    });

    return apiSuccess(
      {
        salesOrders: result.salesOrders.map((salesOrder) =>
          serializeSalesOrder(salesOrder, locale),
        ),
        pagination: result.pagination,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  },
);
