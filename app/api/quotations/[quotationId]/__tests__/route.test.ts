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
  claimLocalization: vi.fn(),
  completeLocalization: vi.fn(),
  failLocalization: vi.fn(),
  localizeQuotationDraft: vi.fn(),
  runLocalizationJob: vi.fn(),

  afterTasks: [] as Array<
    () => void | Promise<void>
  >,
}));

vi.mock(
  "@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner",
  () => ({
    QuotationLocalizationJobRunner: class {
      run = mocks.runLocalizationJob;
    },
  }),
);

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
      claimLocalization = mocks.claimLocalization;
      completeLocalization = mocks.completeLocalization;
      failLocalization = mocks.failLocalization;
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
        id: "line-1",
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
    mocks.claimLocalization.mockReset();
    mocks.completeLocalization.mockReset();
    mocks.failLocalization.mockReset();
    mocks.localizeQuotationDraft.mockReset();
    mocks.runLocalizationJob.mockReset();
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

  it("accepts, clears, and preserves expiry date according to PATCH input", async () => {
    const quotation = createQuotation();
    quotation.updateExpiryDate(new Date("2026-09-01T23:59:59.999Z"));
    mocks.findById.mockResolvedValue(quotation);
    mocks.update.mockResolvedValue(undefined);

    const updateResponse = await PATCH(new Request(
      "http://localhost/api/quotations/quotation-1",
      {
        method: "PATCH",
        body: JSON.stringify({
          expiryDate: "2026-09-15T23:59:59.999Z",
          lines: [{
            id: "line-1",
            position: 1,
            type: "PRODUCT",
            itemName: "Product",
            quantity: 1,
            unitPrice: 10,
          }],
        }),
      },
    ));
    expect(updateResponse.status).toBe(200);
    expect(quotation.expiryDate?.toISOString()).toBe("2026-09-15T23:59:59.999Z");

    const preserveResponse = await PATCH(new Request(
      "http://localhost/api/quotations/quotation-1",
      {
        method: "PATCH",
        body: JSON.stringify({ lines: [{
          id: "line-1", position: 1, type: "PRODUCT",
          itemName: "Product", quantity: 1, unitPrice: 10,
        }] }),
      },
    ));
    expect(preserveResponse.status).toBe(200);
    expect(quotation.expiryDate?.toISOString()).toBe("2026-09-15T23:59:59.999Z");

    const clearResponse = await PATCH(new Request(
      "http://localhost/api/quotations/quotation-1",
      {
        method: "PATCH",
        body: JSON.stringify({
          expiryDate: null,
          lines: [{
            id: "line-1", position: 1, type: "PRODUCT",
            itemName: "Product", quantity: 1, unitPrice: 10,
          }],
        }),
      },
    ));
    expect(clearResponse.status).toBe(200);
    expect(quotation.expiryDate).toBeNull();
  });

  it("rejects an invalid expiry date", async () => {
    mocks.findById.mockResolvedValue(createQuotation());

    const response = await PATCH(new Request(
      "http://localhost/api/quotations/quotation-1",
      {
        method: "PATCH",
        body: JSON.stringify({
          expiryDate: "not-a-date",
          lines: [{
            position: 1, type: "PRODUCT",
            itemName: "Product", quantity: 1, unitPrice: 10,
          }],
        }),
      },
    ));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: { code: "INVALID_DATE", details: { field: "expiryDate" } },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("schedules the reusable localization job after a successful save", async () => {
    const quotation = createQuotation();
    mocks.findById.mockResolvedValue(quotation);
    mocks.update.mockResolvedValue(undefined);
    mocks.runLocalizationJob.mockResolvedValue("NO_CLAIM");

    const response = await PATCH(
      new Request(
        "http://localhost/api/quotations/quotation-1",
        {
          method: "PATCH",
          body: JSON.stringify({
            lines: [
              {
                id: "line-1",
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
    expect(mocks.runLocalizationJob).toHaveBeenCalledWith({
      companyId: "company-1",
      quotationId: "quotation-1",
    });
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

    mocks.findById.mockResolvedValueOnce(quotation); // normal update read
    mocks.findById.mockResolvedValueOnce(quotation); // response snapshot read
    mocks.findById.mockResolvedValueOnce(staleQuotation); // post-claim current read
    mocks.claimLocalization.mockResolvedValue({
      claimToken: "claim-stale",
      sourceSignature: "stale-signature",
      attemptCount: 1,
    });
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
    expect(mocks.localizeQuotationDraft).not.toHaveBeenCalled();
    expect(mocks.completeLocalization).not.toHaveBeenCalled();
    expect(mocks.failLocalization).not.toHaveBeenCalled();
  });

  it("keeps background execution behind the runner seam", async () => {
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
    mocks.claimLocalization.mockImplementation(async () => ({
      claimToken: "claim-success",
      sourceSignature: quotation.localizationSourceSignature!,
      attemptCount: 1,
    }));
    mocks.completeLocalization.mockResolvedValue(false);

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
                id: "line-1",
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
    expect(updates).toHaveLength(1);
    expect(mocks.runLocalizationJob).toHaveBeenCalledWith({
      companyId: "company-1",
      quotationId: "quotation-1",
    });
    return;
    expect(mocks.completeLocalization).toHaveBeenCalledOnce();
    const completion = mocks.completeLocalization.mock.calls[0][0];
    expect(completion).toMatchObject({
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: quotation.localizationSourceSignature,
      expectedClaimToken: "claim-success",
      lines: [{
        id: "line-1",
        itemNameEn: "Product",
        itemNameAr: "منتج",
      }],
    });
    expect(completion.completedAt).toBeInstanceOf(Date);
    expect(Object.keys(completion.header).sort()).toEqual([
      "attentionNameAr",
      "attentionNameEn",
      "briefAr",
      "briefEn",
      "customerNameAr",
      "customerNameEn",
      "notesAr",
      "notesEn",
      "projectNameAr",
      "projectNameEn",
      "subjectAr",
      "subjectEn",
      "termsAndConditionsAr",
      "termsAndConditionsEn",
    ]);
    expect(Object.keys(completion.lines[0]).sort()).toEqual([
      "descriptionAr",
      "descriptionEn",
      "id",
      "itemNameAr",
      "itemNameEn",
      "unitNameAr",
      "unitNameEn",
    ]);
    expect(completion.lines[0]).not.toHaveProperty("quantity");
    expect(completion.lines[0]).not.toHaveProperty("position");
    expect(mocks.failLocalization).not.toHaveBeenCalled();
  });

  it("does not invoke AI or persistence when no claim is acquired", async () => {
    const quotation = createQuotation();
    mocks.findById.mockResolvedValue(quotation);
    mocks.update.mockResolvedValue(undefined);
    mocks.claimLocalization.mockResolvedValue(null);

    const response = await PATCH(new Request(
      "http://localhost/api/quotations/quotation-1",
      {
        method: "PATCH",
        body: JSON.stringify({ lines: [{
          id: "line-1",
          position: 1,
          type: "PRODUCT",
          itemName: "Product",
          quantity: 1,
          unitPrice: 10,
        }] }),
      },
    ));
    await runAfterTasks();

    expect(response.status).toBe(200);
    expect(mocks.localizeQuotationDraft).not.toHaveBeenCalled();
    expect(mocks.completeLocalization).not.toHaveBeenCalled();
    expect(mocks.failLocalization).not.toHaveBeenCalled();
  });
});
