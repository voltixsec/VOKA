import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleSets: [] as string[][],
  execute: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiSuccess: (data: unknown, init?: ResponseInit) =>
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
  ) => {
    mocks.roleSets.push(roles);

    return async (request: Request) => {
      const role =
        request.headers.get("x-test-role") ??
        "VIEWER";

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

      return handler(request, {
        user: {
          id: "bulk-test-user",
        },
      });
    };
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock(
  "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportRunRepository",
  () => ({
    PrismaBulkImportRunRepository: class {},
  }),
);

vi.mock(
  "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository",
  () => ({
    PrismaUniversalLibraryRepository: class {},
  }),
);

vi.mock(
  "@/features/universal-library/application/bulk-import/RunBulkImportFile",
  () => ({
    RunBulkImportFile: class {
      execute = mocks.execute;
    },
  }),
);

import { POST } from "../route";

function makeRequest(
  body: string,
  options?: {
    role?: string;
    secret?: string;
    sourceId?: string | null;
    contentType?: string;
    fileName?: string;
    batchExternalKey?: string;
    sourceNamespace?: string;
  },
) {
  const headers = new Headers();

  headers.set(
    "content-type",
    options?.contentType ??
      "application/x-ndjson",
  );

  headers.set(
    "x-test-role",
    options?.role ?? "OWNER",
  );

  if (options?.secret !== undefined) {
    headers.set(
      "x-voka-ucl-bulk-secret",
      options.secret,
    );
  }

  if (options?.sourceId !== null) {
    headers.set(
      "x-voka-source-id",
      options?.sourceId ?? "source-1",
    );
  }

  if (options?.fileName) {
    headers.set(
      "x-voka-file-name",
      options.fileName,
    );
  }

  if (options?.batchExternalKey) {
    headers.set(
      "x-voka-batch-external-key",
      options.batchExternalKey,
    );
  }

  if (options?.sourceNamespace) {
    headers.set(
      "x-voka-source-namespace",
      options.sourceNamespace,
    );
  }

  return new Request(
    "http://localhost/api/universal-library/bulk-import",
    {
      method: "POST",
      headers,
      body,
    },
  );
}

describe("UCL bulk import API", () => {
  const originalSecret =
    process.env.VOKA_UCL_BULK_IMPORT_SECRET;

  beforeEach(() => {
    mocks.execute.mockReset();

    process.env.VOKA_UCL_BULK_IMPORT_SECRET =
      "test-bulk-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env
        .VOKA_UCL_BULK_IMPORT_SECRET;
    } else {
      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET =
        originalSecret;
    }
  });

  it("restricts the endpoint to OWNER and ADMIN", async () => {
    expect(mocks.roleSets).toContainEqual([
      "OWNER",
      "ADMIN",
    ]);

    const response = await POST(
      makeRequest(
        '{"schemaVersion":"1.0"}\n',
        {
          role: "SALES",
          secret: "test-bulk-secret",
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid operational secret", async () => {
    const missing = await POST(
      makeRequest(
        '{"schemaVersion":"1.0"}\n',
        {
          sourceId: "source-1",
        },
      ),
    );

    expect(missing.status).toBe(403);

    const invalid = await POST(
      makeRequest(
        '{"schemaVersion":"1.0"}\n',
        {
          sourceId: "source-1",
          secret: "wrong-secret",
        },
      ),
    );

    expect(invalid.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires an explicit source id", async () => {
    const response = await POST(
      makeRequest(
        '{"schemaVersion":"1.0"}\n',
        {
          secret: "test-bulk-secret",
          sourceId: null,
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error.code).toBe(
      "SOURCE_ID_REQUIRED",
    );

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types", async () => {
    const response = await POST(
      makeRequest(
        '{"schemaVersion":"1.0"}\n',
        {
          secret: "test-bulk-secret",
          contentType: "application/json",
        },
      ),
    );

    expect(response.status).toBe(415);

    const body = await response.json();

    expect(body.error.code).toBe(
      "INVALID_CONTENT_TYPE",
    );

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects an empty JSONL file", async () => {
    const response = await POST(
      makeRequest(
        "   \n\n\t\n",
        {
          secret: "test-bulk-secret",
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error.code).toBe(
      "EMPTY_BULK_IMPORT",
    );

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    "security-batch-001.jsonl",
    "..\\security-batch-001.jsonl",
    "../security-batch-001.jsonl",
    "C:\\temp\\security-batch-001.jsonl",
    "C:/temp/security-batch-001.jsonl",
    "/tmp/security-batch-001.jsonl",
    "foo\\bar/security-batch-001.jsonl",
  ])("streams a JSONL upload into the governed bulk runner (%s)", async (fileName) => {
    mocks.execute.mockResolvedValue({
      runs: [
        {
          id: "run-1",
          status: "COMPLETED",
          requestedLimit: 2,
          fetchedCount: 2,
          acceptedCount: 2,
          stagedCount: 2,
          duplicateCount: 0,
          changedCount: 0,
          reviewRequiredCount: 0,
          publishedCount: 0,
          rejectedCount: 0,
          failedCount: 0,
          retryCount: 0,
        },
      ],
      summary: {
        totalRecords: 2,
        validRecords: 2,
        invalidRecords: 0,
        newRecords: 2,
        unchangedRecords: 0,
        changedRecords: 0,
        stagedRecords: 2,
        publishedRecords: 0,
        completedChunks: 1,
        partialChunks: 0,
        failedChunks: 0,
        chunkCount: 1,
      },
      errors: [],
    });

    const jsonl =
      '{"schemaVersion":"1.0","entityType":"SYSTEM","externalKey":"system-1","payload":{"name":"System 1"}}\n' +
      '{"schemaVersion":"1.0","entityType":"SERVICE","externalKey":"service-1","payload":{"name":"Service 1"}}\n';

    const response = await POST(
      makeRequest(
        jsonl,
        {
          secret: "test-bulk-secret",
          sourceId: "source-1",
          fileName,
          batchExternalKey:
            "SECURITY_BATCH_001",
          sourceNamespace:
            "VOKA_UCL_SECURITY",
        },
      ),
    );

    expect(response.status).toBe(201);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(
      body.data.summary.publishedRecords,
    ).toBe(0);

    expect(mocks.execute).toHaveBeenCalledTimes(1);

    const input =
      mocks.execute.mock.calls[0][0];

    expect(input).toMatchObject({
      sourceId: "source-1",
      initiatedByUserId:
        "bulk-test-user",
      fileName:
        "security-batch-001.jsonl",
      recordCount: 2,
      batchExternalKey:
        "SECURITY_BATCH_001",
      sourceNamespace:
        "VOKA_UCL_SECURITY",
    });

    expect(input.byteLength).toBe(
      Buffer.byteLength(jsonl),
    );

    expect(input.contentHash).toMatch(
      /^[0-9a-f]{64}$/,
    );

    expect(input.filePath).toMatch(
      /voka-ucl-bulk-.*\.jsonl$/,
    );
  });

  it("returns a bounded failure response if execution fails", async () => {
    mocks.execute.mockRejectedValue(
      new Error(
        "Injected bulk execution failure",
      ),
    );

    const response = await POST(
      makeRequest(
        '{"schemaVersion":"1.0","entityType":"SYSTEM","externalKey":"system-1","payload":{}}\n',
        {
          secret: "test-bulk-secret",
        },
      ),
    );

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body.error.code).toBe(
      "UCL_BULK_IMPORT_FAILED",
    );

    expect(body.error.message).toContain(
      "Injected bulk execution failure",
    );
  });
});
