import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import { CancelSalesOrderUseCase } from "@/src/application/sales-order";
import { PrismaSalesOrderRepository } from "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository";
import { serializeSalesOrder } from "../../serialize-sales-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cancelSalesOrder = new CancelSalesOrderUseCase(
  new PrismaSalesOrderRepository(),
);

function parseCancelExpectedStatus(value: unknown): "DRAFT" | "CONFIRMED" {
  if (value !== "DRAFT" && value !== "CONFIRMED") {
    throw ApiError.badRequest(
      "EXPECTED_STATUS_REQUIRED",
      "expectedStatus must be DRAFT or CONFIRMED.",
    );
  }
  return value;
}

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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw ApiError.badRequest("INVALID_JSON", "Invalid JSON body.");
    }

    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("INVALID_BODY", "Request body must be an object.");
    }

    const record = body as Record<string, unknown>;
    const expectedStatus = parseCancelExpectedStatus(record.expectedStatus);
    const reason = record.reason;

    if (
      reason === undefined ||
      reason === null ||
      typeof reason !== "string" ||
      !reason.trim()
    ) {
      throw ApiError.badRequest(
        "CANCELLATION_REASON_REQUIRED",
        "Cancellation reason is required.",
      );
    }

    const requestedLocale = new URL(request.url).searchParams.get("locale");
    const locale =
      requestedLocale === "ar" || requestedLocale === "en"
        ? requestedLocale
        : undefined;

    const actor = {
      userId: auth.user.id,
      name: auth.user.name?.trim() || auth.user.email,
      role: company.role,
    };

    const result = await cancelSalesOrder.execute({
      companyId: company.companyId,
      salesOrderId,
      expectedStatus,
      reason: reason.trim(),
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
      if (result.error.code === "INVALID_REASON") {
        throw ApiError.badRequest(result.error.code, result.error.message);
      }
      throw ApiError.badRequest(result.error.code, result.error.message);
    }

    return apiSuccess(serializeSalesOrder(result.data, locale), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);
