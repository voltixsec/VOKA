import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiSuccess: (
    data: unknown,
    init?: ResponseInit,
  ) =>
    Response.json(
      {
        success: true,
        data,
      },
      init,
    ),

  withPlatformAdminAuth: (
    roles: string[],
    handler: (
      request: Request,
    ) => Promise<Response>,
  ) =>
    async (
      request: Request,
    ) => {
      const role =
        request.headers.get(
          "x-test-role",
        ) ?? "VIEWER";

      if (!roles.includes(role)) {
        return Response.json(
          {
            success: false,
            error: "Forbidden",
          },
          {
            status: 403,
          },
        );
      }

      return handler(request);
    },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock(
  "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportBatchHistoryRepository",
  () => ({
    PrismaBulkImportBatchHistoryRepository:
      class {},
  }),
);

vi.mock(
  "@/features/universal-library/application/bulk-import/ListBulkImportBatches",
  () => ({
    ListBulkImportBatches:
      class {
        execute =
          mocks.execute;
      },
  }),
);

import { GET } from "../route";

function request(
  query = "",
  role = "OWNER",
) {
  return new Request(
    `http://localhost/api/universal-library/bulk-import/ui/batches${query}`,
    {
      headers: {
        "x-test-role": role,
      },
    },
  );
}

describe(
  "UCL browser-safe batch history bridge",
  () => {
    const originalSecret =
      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET;

    beforeEach(() => {
      mocks.execute.mockReset();

      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET =
        "server-only-secret";
    });

    afterEach(() => {
      if (
        originalSecret ===
        undefined
      ) {
        delete process.env
          .VOKA_UCL_BULK_IMPORT_SECRET;
      } else {
        process.env
          .VOKA_UCL_BULK_IMPORT_SECRET =
          originalSecret;
      }
    });

    it(
      "restricts access to OWNER and ADMIN",
      async () => {
        const response =
          await GET(
            request("", "SALES"),
          );

        expect(
          response.status,
        ).toBe(403);

        expect(
          mocks.execute,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "acts as a server-side operational kill switch",
      async () => {
        delete process.env
          .VOKA_UCL_BULK_IMPORT_SECRET;

        const response =
          await GET(
            request(),
          );

        expect(
          response.status,
        ).toBe(503);

        expect(
          mocks.execute,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns batch history without requiring a client secret",
      async () => {
        mocks.execute
          .mockResolvedValue({
            items: [
              {
                batchExternalKey:
                  "SECURITY_BATCH_001",
                status:
                  "COMPLETED",
                publishedCount:
                  0,
              },
            ],
            total: 1,
          });

        const response =
          await GET(
            request("?limit=25"),
          );

        expect(
          response.status,
        ).toBe(200);

        const body =
          await response.json();

        expect(
          body.data.total,
        ).toBe(1);

        expect(
          JSON.stringify(body),
        ).not.toContain(
          "server-only-secret",
        );

        expect(
          mocks.execute,
        ).toHaveBeenCalledWith({
          limit: 25,
          sourceId:
            undefined,
        });
      },
    );
  },
);
