import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    execute:
      vi.fn(),
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

  withCompanyAuth: (
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

      if (
        !roles.includes(
          role,
        )
      ) {
        return Response.json(
          {},
          {
            status: 403,
          },
        );
      }

      return handler(
        request,
      );
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
  query: string,
) {
  return new Request(
    `http://localhost/api/universal-library/bulk-import/ui/batches/status${query}`,
    {
      headers: {
        "x-test-role":
          "OWNER",
      },
    },
  );
}

describe(
  "UCL browser-safe batch status bridge",
  () => {
    const originalSecret =
      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET;

    beforeEach(() => {
      mocks.execute
        .mockReset();

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
      "returns resumable status without exposing the secret",
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

            retryChunkIndexes:
              [2, 3],

            totals: {
              publishedCount:
                0,
            },

            chunks: [],
          });

        const response =
          await GET(
            request(
              "?sourceId=source-1&batchExternalKey=BATCH-1&sourceNamespace=VOKA_TEST",
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
        ).toEqual(
          [2, 3],
        );

        expect(
          JSON.stringify(
            body,
          ),
        ).not.toContain(
          "server-only-secret",
        );
      },
    );

    it(
      "returns 404 for a fresh logical batch",
      async () => {
        mocks.execute
          .mockResolvedValue(
            null,
          );

        const response =
          await GET(
            request(
              "?sourceId=source-1&batchExternalKey=NEW-BATCH&sourceNamespace=VOKA_TEST",
            ),
          );

        expect(
          response.status,
        ).toBe(404);
      },
    );
  },
);
