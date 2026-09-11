import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { drawingTakeoffSession: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() } },
  ingest: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/src/application/source-artifacts/IngestSourceArtifact", () => ({
  SourceArtifactPolicyError: class SourceArtifactPolicyError extends Error { constructor(public readonly code: string, message: string) { super(message); } },
  ingestSourceArtifact: mocks.ingest,
}));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => { try { return await handler(request, { user: { id: "user-1" } }, { companyId: "company-1" }); } catch (error) { return responses.handleApiError(error); } } };
});

import { POST } from "../route";

const SHA = "a".repeat(64);
const artifact = (overrides: Record<string, unknown> = {}) => ({ id: "artifact-1", companyId: "company-1", contentSha256: SHA, originalFilename: "tower.pdf", citations: [], ...overrides });
const session = (overrides: Record<string, unknown> = {}) => ({ id: "takeoff-1", companyId: "company-1", createdByUserId: "user-1", sourceSha256: SHA, sourceFileName: "old-name.pdf", userIntent: "Count CCTV cameras only", sourceArtifactId: null, lines: [], ...overrides });

function upload(name = "tower.pdf") {
  const form = new FormData();
  form.set("drawing", new File(["%PDF-1.4 drawing"], name, { type: "application/pdf" }));
  form.set("intent", "Count CCTV cameras only");
  return new Request("https://voka.local/api/drawing-takeoffs", { method: "POST", body: form });
}

describe("POST /api/drawing-takeoffs artifact linkage", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.ingest.mockResolvedValue({ idempotent: true, artifact: artifact() }); mocks.prisma.drawingTakeoffSession.updateMany.mockResolvedValue({ count: 1 }); });

  it("links an existing unlinked session only through tenant + content hash identity, never by filename", async () => {
    mocks.prisma.drawingTakeoffSession.findUnique.mockResolvedValue(session());
    const response = await POST(upload("renamed-drawing.pdf"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ idempotent: true, session: { id: "takeoff-1", sourceArtifactId: "artifact-1" } });
    expect(body.data.session).not.toHaveProperty("sourceSha256");
    expect(mocks.prisma.drawingTakeoffSession.updateMany).toHaveBeenCalledWith({ where: { id: "takeoff-1", companyId: "company-1", sourceSha256: SHA, sourceArtifactId: null }, data: { sourceArtifactId: "artifact-1" } });
    expect(mocks.prisma.drawingTakeoffSession.create).not.toHaveBeenCalled();
  });

  it("never overwrites an existing link or backfills when identity is not proven", async () => {
    mocks.prisma.drawingTakeoffSession.findUnique.mockResolvedValue(session({ sourceArtifactId: "artifact-original" }));
    expect((await (await POST(upload())).json()).data.session.sourceArtifactId).toBe("artifact-original");
    expect(mocks.prisma.drawingTakeoffSession.updateMany).not.toHaveBeenCalled();
    mocks.prisma.drawingTakeoffSession.findUnique.mockResolvedValue(session({ sourceSha256: "b".repeat(64) }));
    expect((await (await POST(upload())).json()).data.session.sourceArtifactId).toBeNull();
    mocks.ingest.mockResolvedValue({ idempotent: true, artifact: artifact({ companyId: "company-2" }) });
    mocks.prisma.drawingTakeoffSession.findUnique.mockResolvedValue(session());
    expect((await (await POST(upload())).json()).data.session.sourceArtifactId).toBeNull();
    expect(mocks.prisma.drawingTakeoffSession.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the manual-review contract for a new session and links it to the ingested artifact", async () => {
    mocks.prisma.drawingTakeoffSession.findUnique.mockResolvedValue(null);
    mocks.prisma.drawingTakeoffSession.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "takeoff-2", ...data, lines: [] }));
    const response = await POST(upload());
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(mocks.prisma.drawingTakeoffSession.create.mock.calls[0]?.[0].data).toMatchObject({ companyId: "company-1", sourceArtifactId: "artifact-1", sourceSha256: SHA, userIntent: "Count CCTV cameras only" });
    expect(body.data.analysis).toMatchObject({ status: "EXTERNAL_PENDING" });
    expect(body.data.session.sourceArtifactId).toBe("artifact-1");
  });
});
