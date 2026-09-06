import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  roleSets: [] as string[][],
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

  withCompanyAuth: (
    roles: string[],
    handler: (
      request: Request,
      auth: {
        user: {
          id: string;
        };
      },
    ) => Promise<Response>,
  ) => {
    mocks.roleSets.push(roles);

    return async (
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

      return handler(
        request,
        {
          user: {
            id: "chunk-test-user",
          },
        },
      );
    };
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
  async () => {
    const actual =
      await vi.importActual<any>(
        "@/features/universal-library/application/bulk-import/RunBulkImportChunk",
      );

    return {
      ...actual,
      RunBulkImportChunk: class {
        execute = mocks.execute;
      },
    };
  },
);

import { POST } from "../route";

function makeRequest(
  body: string,
  options: {
    role?: string;
    secret?: string;
    sourceId?: string | null;
    batchExternalKey?:
      string | null;
    chunkIndex?: string | null;
    chunkCount?: string | null;
    contentType?: string;
  } = {},
) {
  const headers =
    new Headers();

  headers.set(
    "content-type",
    options.contentType ??
      "application/x-ndjson",
  );

  headers.set(
    "x-test-role",
    options.role ?? "OWNER",
  );

  if (
    options.secret !== undefined
  ) {
    headers.set(
      "x-voka-ucl-bulk-secret",
      options.secret,
    );
  }

  if (
    options.sourceId !== null
  ) {
    headers.set(
      "x-voka-source-id",
      options.sourceId ??
        "source-1",
    );
  }

  if (
    options.batchExternalKey !==
    null
  ) {
    headers.set(
      "x-voka-batch-external-key",
      options.batchExternalKey ??
        "SECURITY_BATCH_001",
    );
  }

  if (
    options.chunkIndex !== null
  ) {
    headers.set(
      "x-voka-chunk-index",
      options.chunkIndex ?? "1",
    );
  }

  if (
    options.chunkCount !== null
  ) {
    headers.set(
      "x-voka-chunk-count",
      options.chunkCount ?? "3",
    );
  }

  return new Request(
    "http://localhost/api/universal-library/bulk-import/chunk",
    {
      method: "POST",
      headers,
      body,
    },
  );
}

describe(
  "UCL resumable bulk chunk API",
  () => {
    const originalSecret =
      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET;

    beforeEach(() => {
      mocks.execute.mockReset();

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
      "restricts chunk upload to OWNER and ADMIN",
      async () => {
        const response =
          await POST(
            makeRequest(
              '{"x":1}\n',
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

        expect(
          mocks.execute,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "requires operational secret",
      async () => {
        const response =
          await POST(
            makeRequest(
              '{"x":1}\n',
            ),
          );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      "requires batch external key",
      async () => {
        const response =
          await POST(
            makeRequest(
              '{"x":1}\n',
              {
                secret:
                  "test-bulk-secret",
                batchExternalKey:
                  null,
              },
            ),
          );

        expect(
          response.status,
        ).toBe(400);

        const body =
          await response.json();

        expect(
          body.error.code,
        ).toBe(
          "BATCH_EXTERNAL_KEY_REQUIRED",
        );
      },
    );

    it(
      "rejects invalid chunk coordinates",
      async () => {
        const response =
          await POST(
            makeRequest(
              '{"x":1}\n',
              {
                secret:
                  "test-bulk-secret",
                chunkIndex: "4",
                chunkCount: "3",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(400);

        const body =
          await response.json();

        expect(
          body.error.code,
        ).toBe(
          "INVALID_CHUNK_COORDINATES",
        );
      },
    );

    it(
      "executes exactly one logical chunk",
      async () => {
        mocks.execute
          .mockResolvedValue({
            run: {
              id: "run-2",
              status:
                "COMPLETED",
              publishedCount: 0,
            },
            summary: {
              totalRecords: 2,
              validRecords: 2,
              invalidRecords: 0,
              newRecords: 2,
              unchangedRecords: 0,
              changedRecords: 0,
              stagedRecords: 2,
              publishedRecords: 0,
            },
          });

        const jsonl =
          '{"schemaVersion":"1.0","entityType":"SYSTEM","externalKey":"system-1","payload":{}}\n' +
          '{"schemaVersion":"1.0","entityType":"SERVICE","externalKey":"service-1","payload":{}}\n';

        const response =
          await POST(
            makeRequest(
              jsonl,
              {
                secret:
                  "test-bulk-secret",
                chunkIndex: "2",
                chunkCount: "3",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(201);

        expect(
          mocks.execute,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.execute.mock
            .calls[0][0],
        ).toMatchObject({
          sourceId:
            "source-1",
          initiatedByUserId:
            "chunk-test-user",
          batchExternalKey:
            "SECURITY_BATCH_001",
          chunkIndex: 2,
          chunkCount: 3,
          recordCount: 2,
        });

        const body =
          await response.json();

        expect(
          body.data.summary
            .publishedRecords,
        ).toBe(0);
      },
    );

    it(
      "rejects more than 1000 JSONL records",
      async () => {
        const jsonl =
          Array.from(
            {
              length: 1001,
            },
            (_, index) =>
              JSON.stringify({
                schemaVersion:
                  "1.0",
                entityType:
                  "SYSTEM",
                externalKey:
                  `system-${index}`,
                payload: {},
              }),
          ).join("\n") +
          "\n";

        const response =
          await POST(
            makeRequest(
              jsonl,
              {
                secret:
                  "test-bulk-secret",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(413);

        const body =
          await response.json();

        expect(
          body.error.code,
        ).toBe(
          "BULK_IMPORT_CHUNK_TOO_LARGE",
        );

        expect(
          mocks.execute,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
