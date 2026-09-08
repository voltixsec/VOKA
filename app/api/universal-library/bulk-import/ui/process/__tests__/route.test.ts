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
    handler: (request: Request) => Promise<Response>,
  ) =>
    async (request: Request) => {
      const role = request.headers.get("x-test-role") ?? "VIEWER";
      if (!roles.includes(role)) {
        return Response.json({ success: false }, { status: 403 });
      }
      return handler(request);
    },
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock(
  "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportBatchStatusRepository",
  () => ({ PrismaBulkImportBatchStatusRepository: class {} }),
);

vi.mock(
  "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository",
  () => ({ PrismaUniversalLibraryRepository: class {} }),
);

vi.mock(
  "@/features/universal-library/application/bulk-import/ProcessBulkImportWizardBatch",
  () => ({
    MAX_WIZARD_PROCESS_RECORDS: 1000,
    ProcessBulkImportWizardBatch: class {
      execute = mocks.execute;
    },
  }),
);

import { POST } from "../route";

function request(body: unknown, role = "OWNER") {
  return new Request(
    "http://localhost/api/universal-library/bulk-import/ui/process",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-role": role,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("UCL batch wizard process bridge", () => {
  const originalSecret = process.env.VOKA_UCL_BULK_IMPORT_SECRET;

  beforeEach(() => {
    mocks.execute.mockReset();
    process.env.VOKA_UCL_BULK_IMPORT_SECRET = "server-only-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.VOKA_UCL_BULK_IMPORT_SECRET;
    } else {
      process.env.VOKA_UCL_BULK_IMPORT_SECRET = originalSecret;
    }
  });

  it("restricts process to OWNER and ADMIN", async () => {
    const response = await POST(
      request(
        {
          sourceId: "source-1",
          batchExternalKey: "BATCH-1",
        },
        "SALES",
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, "10", 1001])("rejects invalid process limit %s before execution", async maxRecords => {
    const response = await POST(request({ sourceId: "s", batchExternalKey: "b", maxRecords }));
    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("keeps infrastructure details out of the response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.execute.mockRejectedValue(new Error("private database detail"));
      const response = await POST(request({ sourceId: "s", batchExternalKey: "b" }));
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("private database detail");
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it("processes a bounded batch without publishing", async () => {
    mocks.execute.mockResolvedValue({
      processedCount: 2,
      needsReviewCount: 2,
      failedCount: 0,
      publishedCount: 0,
      remainingCount: 0,
      overallStatus: "IN_REVIEW",
    });

    const response = await POST(
      request({
        sourceId: "source-1",
        batchExternalKey: "BATCH-1",
        sourceNamespace: "VOKA_TEST",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.publishedCount).toBe(0);
    expect(body.data.needsReviewCount).toBe(2);
    expect(JSON.stringify(body)).not.toContain("server-only-secret");
  });
});
