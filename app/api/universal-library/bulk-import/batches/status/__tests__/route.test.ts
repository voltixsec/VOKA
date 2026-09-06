import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(
  () => ({
    execute: vi.fn(),
  }),
);

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
  "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportBatchStatusRepository",
  () => ({
    PrismaBulkImportBatchStatusRepository:
      class {},
  }),
);

vi.mock(
  "@/features/universal-library/application/bulk-import/GetBulkImportBatchStatus",
  () => ({
    GetBulkImportBatchStatus:
      class {
        execute =
          mocks.execute;
      },
  }),
);

import { GET } from "../route";

function request(
  query = "",
  options: {
    role?: string;
    secret?: string;
  } = {},
) {
  const headers =
    new Headers();

  headers.set(
    "x-test-role",
    options.role ??
      "OWNER",
  );

  if (options.secret) {
    headers.set(
      "x-voka-ucl-bulk-secret",
      options.secret,
    );
  }

  return new Request(
    `http://localhost/api/universal-library/bulk-import/batches/status${query}`,
    {
      method: "GET",
      headers,
    },
  );
}

describe(
  "UCL bulk batch status API",
  () => {
    const originalSecret =
      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET;

    beforeEach(() => {
      mocks.execute
        .mockReset();

      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET =
        "test-bulk-secret";
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
      "rejects unauthorized company roles",
      async () => {
        const response =
          await GET(
            request(
              "?sourceId=source-1&batchExternalKey=BATCH-1",
              {
                role: "SALES",
                secret:
                  "test-bulk-secret",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      "requires the operational secret",
      async () => {
        const response =
          await GET(
            request(
              "?sourceId=source-1&batchExternalKey=BATCH-1",
            ),
          );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      "requires source and batch identity",
      async () => {
        const response =
          await GET(
            request(
              "",
              {
                secret:
                  "test-bulk-secret",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(400);
      },
    );

    it(
      "returns resumable chunk status",
      async () => {
        mocks.execute
          .mockResolvedValue({
            sourceId:
              "source-1",
            batchExternalKey:
              "BATCH-1",
            sourceNamespace:
              "VOKA_TEST",
            overallStatus:
              "NEEDS_ATTENTION",
            expectedChunks: 3,
            completedChunks: 1,
            partialChunks: 0,
            failedChunks: 1,
            activeChunks: 0,
            missingChunks: 1,
            retryChunkIndexes:
              [2, 3],
            totals: {
              fetchedCount:
                2000,
              acceptedCount:
                1000,
              stagedCount:
                1000,
              duplicateCount:
                0,
              changedCount:
                0,
              reviewRequiredCount:
                0,
              publishedCount:
                0,
              rejectedCount:
                0,
              failedCount:
                1,
            },
            chunks: [],
          });

        const response =
          await GET(
            request(
              "?sourceId=source-1&batchExternalKey=BATCH-1&sourceNamespace=VOKA_TEST",
              {
                secret:
                  "test-bulk-secret",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(200);

        const body =
          await response.json();

        expect(
          body.data
            .retryChunkIndexes,
        ).toEqual([2, 3]);

        expect(
          body.data.totals
            .publishedCount,
        ).toBe(0);

        expect(
          mocks.execute,
        ).toHaveBeenCalledWith({
          sourceId:
            "source-1",
          batchExternalKey:
            "BATCH-1",
          sourceNamespace:
            "VOKA_TEST",
        });
      },
    );

    it(
      "returns 404 for an unknown batch",
      async () => {
        mocks.execute
          .mockResolvedValue(
            null,
          );

        const response =
          await GET(
            request(
              "?sourceId=source-1&batchExternalKey=UNKNOWN",
              {
                secret:
                  "test-bulk-secret",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(404);
      },
    );
  },
);
