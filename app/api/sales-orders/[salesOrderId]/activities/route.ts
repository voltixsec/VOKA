import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import {
  AddSalesOrderActivityUseCase,
  ListSalesOrderActivitiesUseCase,
} from "@/src/application/sales-order";
import { PrismaSalesOrderActivityRepository } from "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderActivityRepository";
import { PrismaSalesOrderRepository } from "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository";
import { serializeSalesOrderActivity } from "../../serialize-sales-order-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const salesOrdersRepo = new PrismaSalesOrderRepository();
const activitiesRepo = new PrismaSalesOrderActivityRepository();

const addActivity = new AddSalesOrderActivityUseCase(salesOrdersRepo, activitiesRepo);
const listActivities = new ListSalesOrderActivitiesUseCase(salesOrdersRepo, activitiesRepo);

function getSalesOrderId(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const actIndex = segments.indexOf("activities");
  const salesOrderId = actIndex > 0 ? segments[actIndex - 1] : undefined;

  if (!salesOrderId || salesOrderId === "sales-orders") {
    throw ApiError.badRequest(
      "SALES_ORDER_ID_REQUIRED",
      "salesOrderId is required.",
    );
  }

  return decodeURIComponent(salesOrderId);
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, companyContext) => {
    const salesOrderId = getSalesOrderId(request);
    const result = await listActivities.execute({
      companyId: companyContext.companyId,
      salesOrderId,
    });

    if (!result.success) {
      throw ApiError.notFound(result.error.code, result.error.message);
    }

    return apiSuccess(
      {
        activities: result.data.map(serializeSalesOrderActivity),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  },
);

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, auth, companyContext) => {
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
    const noteBody = record.body;

    if (typeof noteBody !== "string" || !noteBody.trim()) {
      throw ApiError.badRequest(
        "NOTE_BODY_REQUIRED",
        "Activity note body is required.",
      );
    }

    if (noteBody.trim().length > 2000) {
      throw ApiError.badRequest(
        "NOTE_BODY_TOO_LONG",
        "Activity note body exceeds maximum length of 2000 characters.",
      );
    }

    const actor = {
      userId: auth.user.id,
      name: auth.user.name?.trim() || auth.user.email,
      role: companyContext.role,
    };

    const result = await addActivity.execute({
      companyId: companyContext.companyId,
      salesOrderId,
      body: noteBody,
      actor,
    });

    if (!result.success) {
      if (result.error.code === "SALES_ORDER_NOT_FOUND") {
        throw ApiError.notFound(result.error.code, result.error.message);
      }
      throw ApiError.badRequest(result.error.code, result.error.message);
    }

    return apiSuccess(serializeSalesOrderActivity(result.data), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  },
);
