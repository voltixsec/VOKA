import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import { ConfirmSalesOrderUseCase } from "@/src/application/sales-order";
import { PrismaSalesOrderRepository } from "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository";
import { serializeSalesOrder } from "../../serialize-sales-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmSalesOrder = new ConfirmSalesOrderUseCase(
  new PrismaSalesOrderRepository(),
);

function getSalesOrderId(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = segments.indexOf("sales-orders");
  if (index !== -1 && segments.length > index + 1) {
    return decodeURIComponent(segments[index + 1]);
  }
  throw ApiError.badRequest(
    "SALES_ORDER_ID_REQUIRED",
    "salesOrderId is required.",
  );
}

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, auth, company) => {
    const salesOrderId = getSalesOrderId(request);
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      throw ApiError.badRequest("INVALID_JSON", "Invalid JSON body.");
    }

    const { expectedStatus } = body ?? {};
    if (!expectedStatus || typeof expectedStatus !== "string") {
      throw ApiError.badRequest(
        "EXPECTED_STATUS_REQUIRED",
        "expectedStatus is required.",
      );
    }

    const requestedLocale = new URL(request.url).searchParams.get("locale");
    const locale =
      requestedLocale === "ar" || requestedLocale === "en"
        ? requestedLocale
        : undefined;

    const actor = {
      userId: auth.user.id,
      name: auth.user.name?.trim() || auth.user.email || "Authorized User",
      role: company.role,
    };

    const result = await confirmSalesOrder.execute({
      companyId: company.companyId,
      salesOrderId,
      expectedStatus: expectedStatus as any,
      actor,
    });

    if (!result.success) {
      if (result.error.code === "SALES_ORDER_NOT_FOUND") {
        throw ApiError.notFound(result.error.code, result.error.message);
      }
      if (result.error.code === "STALE_STATE") {
        throw ApiError.conflict(result.error.code, result.error.message, {
          currentStatus: result.error.currentStatus,
        });
      }
      throw ApiError.badRequest(result.error.code, result.error.message);
    }

    return apiSuccess(serializeSalesOrder(result.data, locale), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);
