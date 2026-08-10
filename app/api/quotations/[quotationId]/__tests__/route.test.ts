import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  roleSets: [] as string[][],
  update: vi.fn(),
  localizeQuotationDraft: vi.fn(),

  afterTasks: [] as Array<
    () => void | Promise<void>
  >,
}));

vi.mock(
  "@/src/infrastructure/translation/quotation/localizeQuotationDraft",
  () => ({
    localizeQuotationDraft:
      mocks.localizeQuotationDraft,
  }),
);

vi.mock(
  "next/server",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("next/server")
      >();

    return {
      ...actual,

      after: (
        task: () =>
          void | Promise<void>,
      ) => {
        mocks.afterTasks.push(
          task,
        );
      },
    };
  },
);

vi.mock(
  "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository",
  () => ({
    PrismaQuotationRepository: class {
      findById = mocks.findById;
      update = mocks.update;
    },
  }),
);
vi.mock(
  "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator",
  () => ({
    PrismaQuotationReferenceValidator: class {
      findInvalidReference = vi.fn();
      getCustomerSnapshot = vi.fn();
    },
  }),
);


vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<
    typeof import("@/lib/api/ApiError")
  >("@/lib/api/ApiError");
  const responses = await vi.importActual<
    typeof import("@/lib/api/ApiResponse")
  >("@/lib/api/ApiResponse");

  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (
      allowedRoles: readonly string[],
      handler: (
        request: Request,
        auth: never,
        company: { companyId: string },
      ) => Promise<Response>,
    ) => {
      mocks.roleSets.push([...allowedRoles]);

      return async (request: Request) => {
        try {
          return await handler(
            request,
            {} as never,
            {
              companyId: "company-1",
            },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { Quotation } from "@/src/domain/quotation";

import { GET, PATCH } from "../route";

function createQuotation(): Quotation {
  return Quotation.restore({
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    issueDate: new Date("2026-08-04T00:00:00.000Z"),
    customer: {
      name: "First United",
    },
    lines: [
      {
        position: 1,
        type: "PRODUCT",
        itemName: "Product",
        quantity: 1,
        unitPrice: 10,
      },
    ],
  });
}

describe("GET /api/quotations/[quotationId]", () => {
  beforeEach(() => {
    mocks.afterTasks.length = 0;
    mocks.findById.mockReset();
    mocks.update.mockReset();
    mocks.localizeQuotationDraft.mockReset();
  });

  async function runAfterTasks() {
    const tasks = mocks.afterTasks.splice(0);
    for (const task of tasks) {
      await task();
    }
  }

  it("returns a tenant-scoped quotation to every read role", async () => {
    mocks.findById.mockResolvedValue(createQuotation());

    const response = await GET(
      new Request(
        "http://localhost/api/quotations/quotation-1",
      ),
    );
    const body = await response.json();

    expect(mocks.roleSets).toContainEqual([
      "OWNER",
      "ADMIN",
      "SALES",
      "VIEWER",
    ]);
    expect(mocks.findById).toHaveBeenCalledWith(
      "company-1",
      "quotation-1",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "quotation-1",
        companyId: "company-1",
        quotationNumber: "Q-001",
      },
    });
  });

  it("returns the same 404 for missing and cross-company ids", async () => {
    mocks.findById.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://localhost/api/quotations/other-company-quotation",
      ),
    );
    const body = await response.json();

    expect(mocks.findById).toHaveBeenCalledWith(
      "company-1",
      "other-company-quotation",
    );
    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: {
        code: "QUOTATION_NOT_FOUND",
        message: "Quotation not found.",

      },
    });
  });
  it("updates a draft quotation inside the active company", async () => {
    const quotation = createQuotation();
    mocks.findById.mockResolvedValue(quotation);
    mocks.update.mockResolvedValue(undefined);

    const response = await PATCH(
      new Request(
        "http://localhost/api/quotations/quotation-1",
        {
          method: "PATCH",
          body: JSON.stringify({
            lines: [
              {
                position: 1,
                type: "PRODUCT",
                itemName: "Updated Product",
                quantity: 2,
                unitPrice: 15,
              },
            ],
          }),
        },
      ),
    );

    const body = await response.json();

    expect(mocks.update).toHaveBeenCalledWith(
      "company-1",
      quotation,
    );
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "quotation-1",
        totals: {
          totalAmount: 30,
        },
      },
    });
  });

  it("persists FAILED when AI fails and signature matches", async () => {
    const quotation = createQuotation();
    quotation.markLocalizationPending(
      "en",
      new Date("2026-08-04T00:00:00.000Z"),
    );
    mocks.findById.mockResolvedValue(quotation);
    mocks.localizeQuotationDraft.mockRejectedValue(
      new Error("Provider unavailable"),
    );

    const updates: Array<unknown> = [];
    mocks.update.mockImplementation(async (_companyId, updatedQuotation) => {
      updates.push(updatedQuotation);
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/quotations/quotation-1",
        {
          method: "PATCH",
          body: JSON.stringify({
            lines: [
              {
                position: 1,
                type: "PRODUCT",
                itemName: "Product",
                quantity: 1,
                unitPrice: 10,
              },
            ],
          }),
        },
      ),
    );

    await runAfterTasks();

    expect(response.status).toBe(200);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    const failedUpdate = updates[updates.length - 1] as { localizationStatus: string; localizationLastError: string | null; localizationRequestedAt: Date | null; localizationSourceLocale: string | null };
    expect(failedUpdate.localizationStatus).toBe("FAILED");
    expect(failedUpdate.localizationLastError).toBe(
      "TRANSLATION_PROVIDER_ERROR",
    );
    expect(failedUpdate.localizationRequestedAt).toBe(
      quotation.localizationRequestedAt,
    );
    expect(failedUpdate.localizationSourceLocale).toBe(
      quotation.localizationSourceLocale,
    );
  });

  it("does not mutate lifecycle when AI fails on stale quotation", async () => {
    const quotation = createQuotation();
    quotation.markLocalizationPending(
      "en",
      new Date("2026-08-04T00:00:00.000Z"),
    );
    const staleQuotation = createQuotation();
    staleQuotation.replaceLines([
      {
        position: 1,
        type: "PRODUCT",
        itemName: "Updated Product",
        quantity: 1,
        unitPrice: 10,
      },
    ]);
    staleQuotation.markLocalizationPending(
      "en",
      new Date("2026-08-04T00:00:00.000Z"),
    );

    mocks.findById.mockResolvedValueOnce(quotation); // initial find
    mocks.findById.mockResolvedValueOnce(quotation); // updated snapshot read
    mocks.findById.mockResolvedValueOnce(staleQuotation); // stale latest
    mocks.localizeQuotationDraft.mockResolvedValue(
      {} as unknown,
    );
    mocks.update.mockResolvedValue(undefined);

    const response = await PATCH(
      new Request(
        "http://localhost/api/quotations/quotation-1",
        {
          method: "PATCH",
          body: JSON.stringify({
            lines: [
              {
                position: 1,
                type: "PRODUCT",
                itemName: "Product",
                quantity: 1,
                unitPrice: 10,
              },
            ],
          }),
        },
      ),
    );

    await runAfterTasks();

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("completes localization with timestamp on current AI success", async () => {
    const quotation = createQuotation();
    quotation.markLocalizationPending(
      "en",
      new Date("2026-08-04T00:00:00.000Z"),
    );
    mocks.findById.mockResolvedValue(quotation);
    mocks.localizeQuotationDraft.mockImplementation(
      async (snapshot) => {
        return {
          ...snapshot,
          lines: Array.isArray(snapshot.lines)
            ? snapshot.lines.map(
                (line: Record<string, unknown>) => ({
                  ...line,
                  itemNameEn: line.itemName ?? null,
                  itemNameAr: "منتج",
                }),
              )
            : [],
        } as unknown as typeof snapshot;
      },
    );

    const updates: Array<unknown> = [];
    mocks.update.mockImplementation(async (_companyId, updatedQuotation) => {
      updates.push(updatedQuotation);
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/quotations/quotation-1",
        {
          method: "PATCH",
          body: JSON.stringify({
            lines: [
              {
                position: 1,
                type: "PRODUCT",
                itemName: "Product",
                quantity: 1,
                unitPrice: 10,
              },
            ],
          }),
        },
      ),
    );

    await runAfterTasks();

    expect(response.status).toBe(200);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    const completedUpdate = updates[updates.length - 1] as { localizationStatus: string; localizationCompletedAt: Date | null };
    expect(completedUpdate.localizationStatus).toBe("COMPLETED");
    expect(completedUpdate.localizationCompletedAt).toBeInstanceOf(Date);
  });
});
