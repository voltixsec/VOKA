import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleSets: [] as string[][],
  ingestExecute: vi.fn(),
  processExecute: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiSuccess: (data: unknown, init?: ResponseInit) => Response.json({ data }, init),
  withCompanyAuth: (roles: string[], handler: (request: Request) => Promise<Response>) => {
    mocks.roleSets.push(roles);
    return async (request: Request) => {
      const role = request.headers.get("x-test-role") || "VIEWER";
      if (!roles.includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });
      return handler(request);
    };
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/features/universal-library", () => ({
  PrismaUniversalLibraryRepository: class {},
  IngestSourceRecord: class { execute = mocks.ingestExecute; },
  ProcessIngestionBatch: class { execute = mocks.processExecute; },
}));

import { POST as ingestPost } from "../route";
import { POST as processPost } from "../process/route";

function request(url: string, body: string, role = "OWNER") {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-test-role": role }, body });
}

describe("UCL ingestion admin API", () => {
  beforeEach(() => {
    mocks.ingestExecute.mockReset();
    mocks.processExecute.mockReset();
  });

  it("restricts both endpoints to OWNER and ADMIN", async () => {
    expect(mocks.roleSets).toEqual(expect.arrayContaining([["OWNER", "ADMIN"], ["OWNER", "ADMIN"]]));
    expect((await ingestPost(request("http://test/ingest", "{}", "SALES"))).status).toBe(403);
    expect((await processPost(request("http://test/process", "{}", "VIEWER"))).status).toBe(403);
  });

  it("rejects malformed JSON and unsupported entity types", async () => {
    expect((await ingestPost(request("http://test/ingest", "{"))).status).toBe(400);
    const invalidEntity = await ingestPost(request("http://test/ingest", JSON.stringify({
      sourceId: "source-1", sourceExternalId: "external-1", entityType: "TENANT_PRODUCT", rawPayload: { name: "Synthetic" },
    })));
    expect(invalidEntity.status).toBe(400);
    expect(mocks.ingestExecute).not.toHaveBeenCalled();
  });

  it("rejects malformed and out-of-range process limits", async () => {
    expect((await processPost(request("http://test/process", "{"))).status).toBe(400);
    for (const batchSize of [0, 101, 1.5, "50"]) {
      expect((await processPost(request("http://test/process", JSON.stringify({ batchSize })))).status).toBe(400);
    }
    expect(mocks.processExecute).not.toHaveBeenCalled();
  });

  it("explicitly maps accepted fields and uses the bounded default", async () => {
    mocks.ingestExecute.mockResolvedValue({
      ingestionRecord: {
        id: "record-1", sourceId: "source-1", sourceExternalId: "external-1", status: "NORMALIZED",
        errorMessage: null, createdAt: new Date("2026-08-21T00:00:00.000Z"),
      },
      isDuplicatePayload: false,
      isNewRecord: true,
    });
    mocks.processExecute.mockResolvedValue({ processedCount: 0 });

    expect((await ingestPost(request("http://test/ingest", JSON.stringify({
      sourceId: " source-1 ", sourceExternalId: " external-1 ", rawPayload: { name: "Synthetic" }, ignored: "field",
    })))).status).toBe(201);
    expect(mocks.ingestExecute).toHaveBeenCalledWith({
      sourceId: "source-1", sourceExternalId: "external-1", entityType: undefined, rawPayload: { name: "Synthetic" },
    });

    expect((await processPost(request("http://test/process", "{}"))).status).toBe(200);
    expect(mocks.processExecute).toHaveBeenCalledWith({ batchSize: undefined });
  });
});
