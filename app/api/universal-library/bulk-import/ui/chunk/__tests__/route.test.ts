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

  withPlatformAdminAuth: (
    roles: string[],
    handler: (
      request: Request,
      auth: {
        user: {
          id: string;
        };
      },
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
          {
            success: false,
          },
          {
            status: 403,
          },
        );
      }

      return handler(
        request,
        {
          user: {
            id:
              "ui-test-user",
          },
        },
      );
    },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock(
  "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportRunRepository",
  () => ({
    PrismaBulkImportRunRepository:
      class {},
  }),
);

vi.mock(
  "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository",
  () => ({
    PrismaUniversalLibraryRepository:
      class {},
  }),
);

vi.mock(
  "@/features/universal-library/application/bulk-import/RunBulkImportChunk",
  () => ({
    MAX_BULK_IMPORT_CHUNK_RECORDS:
      1000,

    RunBulkImportChunk:
      class {
        execute =
          mocks.execute;
      },
  }),
);

import { POST } from "../route";

function makeRequest(
  body: string,
  options: {
    role?: string;
    sourceId?: string;
    batch?: string;
    chunkIndex?: string;
    chunkCount?: string;
  } = {},
) {
  return new Request(
    "http://localhost/api/universal-library/bulk-import/ui/chunk",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/x-ndjson",

        "x-test-role":
          options.role ??
          "OWNER",

        "x-voka-source-id":
          options.sourceId ??
          "source-1",

        "x-voka-file-name":
          "batch.jsonl",

        "x-voka-batch-external-key":
          options.batch ??
          "BATCH-1",

        "x-voka-source-namespace":
          "VOKA_TEST",

        "x-voka-chunk-index":
          options.chunkIndex ??
          "1",

        "x-voka-chunk-count":
          options.chunkCount ??
          "2",
      },
      body,
    },
  );
}

describe(
  "UCL browser-safe chunk bridge",
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
      "restricts upload to OWNER and ADMIN",
      async () => {
        const response =
          await POST(
            makeRequest(
              '{"x":1}\n',
              {
                role:
                  "SALES",
              },
            ),
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
      "uses server-side secret only as an operational kill switch",
      async () => {
        delete process.env
          .VOKA_UCL_BULK_IMPORT_SECRET;

        const response =
          await POST(
            makeRequest(
              '{"x":1}\n',
            ),
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
      "executes one browser-uploaded internal chunk",
      async () => {
        mocks.execute
          .mockResolvedValue({
            run: {
              id: "run-1",
              status:
                "COMPLETED",
              publishedCount:
                0,
            },
            summary: {
              totalRecords: 2,
              validRecords: 2,
              invalidRecords: 0,
              newRecords: 2,
              unchangedRecords: 0,
              changedRecords: 0,
              stagedRecords: 2,
              publishedRecords:
                0,
            },
          });

        const response =
          await POST(
            makeRequest(
              '{"x":1}\n{"x":2}\n',
            ),
          );

        expect(
          response.status,
        ).toBe(201);

        expect(
          mocks.execute,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.execute.mock
            .calls[0][0],
        ).toMatchObject({
          sourceId:
            "source-1",

          initiatedByUserId:
            "ui-test-user",

          batchExternalKey:
            "BATCH-1",

          sourceNamespace:
            "VOKA_TEST",

          chunkIndex: 1,
          chunkCount: 2,
          recordCount: 2,
        });

        const body =
          await response.json();

        expect(
          body.data.summary
            .publishedRecords,
        ).toBe(0);

        expect(
          JSON.stringify(
            body,
          ),
        ).not.toContain(
          "server-only-secret",
        );
      },
    );
  },
);
