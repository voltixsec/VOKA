import { describe, expect, it } from "vitest";
import { AcquisitionPolicyError, AcquisitionRunRecord, GovernedAcquisitionSource, IAcquisitionRepository, SourcePolicyGate } from "../../domain";
import { RunControlledAcquisition } from "../../application/acquisition";
import { AcquisitionNetworkError, SafeHttpJsonClient, isProhibitedAddress } from "../../infrastructure/acquisition";

const approved = (overrides: Partial<GovernedAcquisitionSource> = {}): GovernedAcquisitionSource => ({
  id: "source-1", name: "Approved public feed", url: "https://data.example.test/products",
  isActive: true, approvalState: "APPROVED", commercialUseState: "ALLOWED",
  redistributionState: "ALLOWED", healthStatus: "HEALTHY", licenseInfo: "Explicit open commercial license",
  licenseReferenceUrl: "https://data.example.test/license", robotsPolicy: "ALLOWED", attributionRequired: true,
  maxRequestsPerMinute: 5, maxRecordsPerRun: 100, maxRecordsPerDay: 500,
  acquisitionTimeoutMs: 5000, maxRetries: 1, ...overrides,
});

describe("UCL-6 source policy", () => {
  it.each([
    [{ approvalState: "DRAFT" }, "SOURCE_NOT_APPROVED"], [{ approvalState: "PAUSED" }, "SOURCE_NOT_APPROVED"],
    [{ approvalState: "BLOCKED" }, "SOURCE_NOT_APPROVED"], [{ isActive: false }, "SOURCE_INACTIVE"],
    [{ commercialUseState: "UNKNOWN" }, "COMMERCIAL_USE_NOT_ALLOWED"], [{ commercialUseState: "DISALLOWED" }, "COMMERCIAL_USE_NOT_ALLOWED"],
    [{ redistributionState: "UNKNOWN" }, "REDISTRIBUTION_NOT_ALLOWED"], [{ redistributionState: "DISALLOWED" }, "REDISTRIBUTION_NOT_ALLOWED"],
    [{ healthStatus: "BLOCKED" }, "SOURCE_HEALTH_BLOCKED"], [{ licenseInfo: null }, "LICENSE_EVIDENCE_MISSING"],
    [{ licenseReferenceUrl: null }, "LICENSE_EVIDENCE_MISSING"], [{ robotsPolicy: "DISALLOWED" }, "SOURCE_POLICY_BLOCKED"],
  ] as Array<[Partial<GovernedAcquisitionSource>, string]>)("fails closed for unsafe governance %#", (override, code) => {
    expect(() => SourcePolicyGate.assertCanAcquire(approved(override))).toThrowError(expect.objectContaining({ code }));
  });
  it("allows an explicitly approved source", () => expect(() => SourcePolicyGate.assertCanAcquire(approved())).not.toThrow());
});

describe("UCL-6 SSRF boundary", () => {
  it.each(["127.0.0.1", "127.99.1.2", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1"])("blocks prohibited address %s", (address) => expect(isProhibitedAddress(address)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", (address) => expect(isProhibitedAddress(address)).toBe(false));
  it.each(["file:///etc/passwd", "ftp://example.test/file", "http://user:pass@example.test/"])("rejects unsafe URL %s", async (url) => {
    const client = new SafeHttpJsonClient(async () => new Response("{}"), async () => [{ address: "8.8.8.8", family: 4 }]);
    await expect(client.getJson({ url, timeoutMs: 1000, maxRetries: 0 })).rejects.toBeInstanceOf(AcquisitionNetworkError);
  });
  it("blocks localhost hostname", async () => {
    const client = new SafeHttpJsonClient(async () => new Response("{}"));
    await expect(client.getJson({ url: "http://localhost/data", timeoutMs: 1000, maxRetries: 0 })).rejects.toMatchObject({ code: "PRIVATE_DESTINATION" });
  });
  it("blocks a hostname resolving privately", async () => {
    const client = new SafeHttpJsonClient(async () => new Response("{}"), async () => [{ address: "10.0.0.8", family: 4 }]);
    await expect(client.getJson({ url: "https://public.example/data", timeoutMs: 1000, maxRetries: 0 })).rejects.toMatchObject({ code: "PRIVATE_DESTINATION" });
  });
  it("revalidates DNS on redirects and blocks rebinding", async () => {
    let resolutions = 0;
    const client = new SafeHttpJsonClient(async () => new Response(null, { status: 302, headers: { location: "/next" } }), async () => [{ address: ++resolutions === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }]);
    await expect(client.getJson({ url: "https://public.example/data", timeoutMs: 1000, maxRetries: 0 })).rejects.toMatchObject({ code: "PRIVATE_DESTINATION" });
  });
  it("rejects cross-origin redirects", async () => {
    const client = new SafeHttpJsonClient(async () => new Response(null, { status: 302, headers: { location: "https://other.example/data" } }), async () => [{ address: "8.8.8.8", family: 4 }]);
    await expect(client.getJson({ url: "https://public.example/data", timeoutMs: 1000, maxRetries: 0 })).rejects.toMatchObject({ code: "CROSS_ORIGIN_REDIRECT" });
  });
  it("honors bounded Retry-After", async () => {
    let calls = 0; const delays: number[] = [];
    const client = new SafeHttpJsonClient(async () => ++calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "1" } }) : new Response("{}"), async () => [{ address: "8.8.8.8", family: 4 }], async (ms) => { delays.push(ms); });
    const result = await client.getJson({ url: "https://public.example/data", timeoutMs: 1000, maxRetries: 1 });
    expect(result.retryCount).toBe(1); expect(delays).toEqual([1000]);
  });
  it("does not retry permanent 4xx", async () => {
    let calls = 0; const client = new SafeHttpJsonClient(async () => { calls++; return new Response("", { status: 404 }); }, async () => [{ address: "8.8.8.8", family: 4 }]);
    await expect(client.getJson({ url: "https://public.example/data", timeoutMs: 1000, maxRetries: 2 })).rejects.toMatchObject({ code: "PERMANENT_HTTP_ERROR" }); expect(calls).toBe(1);
  });
});

class MemoryRuns implements IAcquisitionRepository {
  public run!: AcquisitionRunRecord; constructor(public source = approved()) {}
  async getGovernedSource() { return this.source; }
  async reserveRun(input: any) { this.run = { id: "run-1", sourceId: this.source.id, initiatedByUserId: input.initiatedByUserId, dryRun: input.dryRun, status: "RUNNING", requestedLimit: input.requestedLimit, fetchedCount: 0, acceptedCount: 0, stagedCount: 0, duplicateCount: 0, changedCount: 0, reviewRequiredCount: 0, publishedCount: 0, rejectedCount: 0, failedCount: 0, retryCount: 0, policySnapshot: input.policySnapshot, startedAt: new Date() }; return this.run; }
  async completeRun(_id: string, status: any, counters: any, extra: any) { this.run = { ...this.run, ...counters, ...extra, status, completedAt: new Date() }; return this.run; }
  async getRun() { return this.run || null; } async listRuns() { return this.run ? [this.run] : []; }
}

describe("UCL-6 controlled flow", () => {
  it("dry-run never stages records and reports dispositions", async () => {
    let staged = 0; const repo = new MemoryRuns();
    const useCase = new RunControlledAcquisition(repo, { acquire: async () => ({ records: [{ externalRecordId: "1", rawPayload: { name: "Item" }, canonicalSourceUrl: repo.source.url!, fetchedAt: new Date() }], retryCount: 0 }) }, { preview: async () => "NEW", stage: async () => { staged++; return { disposition: "NEW", status: "NORMALIZED" }; } });
    const run = await useCase.execute({ sourceId: repo.source.id, initiatedByUserId: "user-1", dryRun: true, limit: 1 });
    expect(run.status).toBe("COMPLETED"); expect(run.acceptedCount).toBe(1); expect(run.stagedCount).toBe(0); expect(staged).toBe(0);
  });
  it("live mode stages through the injected UCL-3 boundary", async () => {
    const repo = new MemoryRuns(); let runId = "";
    const useCase = new RunControlledAcquisition(repo, { acquire: async () => ({ records: [{ externalRecordId: "1", rawPayload: { name: "Item" }, canonicalSourceUrl: repo.source.url!, fetchedAt: new Date() }], retryCount: 0 }) }, { preview: async () => "NEW", stage: async (_source, id) => { runId = id; return { disposition: "NEW", status: "NEEDS_REVIEW" }; } });
    const run = await useCase.execute({ sourceId: repo.source.id, initiatedByUserId: "user-1", dryRun: false, limit: 1 });
    expect(runId).toBe("run-1"); expect(run.stagedCount).toBe(1); expect(run.reviewRequiredCount).toBe(1); expect(run.publishedCount).toBe(0);
  });
  it("enforces the global hard request bound", async () => {
    const repo = new MemoryRuns(); const useCase = new RunControlledAcquisition(repo, { acquire: async () => ({ records: [], retryCount: 0 }) }, { preview: async () => "NEW", stage: async () => ({ disposition: "NEW", status: "NORMALIZED" }) });
    await expect(useCase.execute({ sourceId: repo.source.id, initiatedByUserId: "user-1", dryRun: true, limit: 1001 })).rejects.toBeInstanceOf(AcquisitionPolicyError);
  });
  it("fails a run when an adapter exceeds its reserved bound", async () => {
    const repo = new MemoryRuns(); const record = { externalRecordId: "1", rawPayload: { name: "Item" }, canonicalSourceUrl: repo.source.url!, fetchedAt: new Date() };
    const useCase = new RunControlledAcquisition(repo, { acquire: async () => ({ records: [record, { ...record, externalRecordId: "2" }], retryCount: 0 }) }, { preview: async () => "NEW", stage: async () => ({ disposition: "NEW", status: "NORMALIZED" }) });
    const run = await useCase.execute({ sourceId: repo.source.id, initiatedByUserId: "user-1", dryRun: true, limit: 1 });
    expect(run.status).toBe("FAILED"); expect(run.failedCount).toBe(1); expect(run.stagedCount).toBe(0);
  });
  it("fails a run when an adapter spoofs the governed source origin", async () => {
    const repo = new MemoryRuns();
    const useCase = new RunControlledAcquisition(repo, { acquire: async () => ({ records: [{ externalRecordId: "1", rawPayload: { name: "Item" }, canonicalSourceUrl: "https://evil.example/data", fetchedAt: new Date() }], retryCount: 0 }) }, { preview: async () => "NEW", stage: async () => ({ disposition: "NEW", status: "NORMALIZED" }) });
    const run = await useCase.execute({ sourceId: repo.source.id, initiatedByUserId: "user-1", dryRun: false, limit: 1 });
    expect(run.status).toBe("FAILED"); expect(run.stagedCount).toBe(0);
  });
});
