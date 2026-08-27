import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => { try { return await handler(request, {}, { companyId: "tenant-1" }); } catch (error) { return responses.handleApiError(error); } } };
});

import { POST } from "../route";

describe("POST /api/ai/transcription", () => {
  beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_BASE_URL", "https://openai.test/v1"); });
  afterEach(() => vi.unstubAllEnvs());

  it("sends one completed audio file and normalizes protected technical terms", async () => {
    const upstream = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "اتناشر كاميرا مع إن في آر و بي او اي و آر جي 45 و أربع ميجا بكسل" }) });
    vi.stubGlobal("fetch", upstream);
    const form = new FormData(); form.set("audio", new File(["audio"], "recording.webm", { type: "audio/webm" }));
    const response = await POST(new Request("http://localhost/api/ai/transcription", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.text).toContain("NVR");
    expect((await (upstream.mock.calls[0]?.[1] as RequestInit).body as FormData).get("prompt")).toContain("Egyptian Arabic");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("rejects non-audio input without contacting a provider", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const form = new FormData(); form.set("audio", new File(["text"], "note.txt", { type: "text/plain" }));
    const response = await POST(new Request("http://localhost/api/ai/transcription", { method: "POST", body: form }));
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
