import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAiWebDiscoveryAdapter } from "../OpenAiWebDiscoveryAdapter";
import { SystemDiscoverySeed } from "../../../domain/discovery";

describe("OpenAiWebDiscoveryAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws an error if OPENAI_API_KEY is not set", async () => {
    const adapter = new OpenAiWebDiscoveryAdapter({ apiKey: "", fetchFn: vi.fn() });
    await expect(adapter.discoverSystem({ prompt: "CCTV Cameras" })).rejects.toThrow(
      /OPENAI_API_KEY is not configured/i
    );
  });

  it("sends correct payload to OpenAI API and parses valid SystemDiscoverySeed", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                id: "cctv-system-01",
                seedType: "SYSTEM",
                nameEn: "4K Enterprise IP Surveillance System",
                nameAr: "نظام المراقبة باستعمال الكاميرات",
                confidence: 0.95,
                domainHint: "Security & Surveillance",
                categoryHint: "CCTV_SYSTEMS",
                evidence: [
                  {
                    url: "https://www.hikvision.com/en/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/",
                    title: "Hikvision Network Camera Catalog",
                    publisher: "Hikvision",
                    sourceType: "MANUFACTURER_DATASHEET",
                    claimSupport: ["Official product datasheets and specifications"],
                  },
                ],
                components: [
                  {
                    key: "ip_camera_4k",
                    componentType: "PRODUCT",
                    nameEn: "4K Dome Network Camera",
                    purpose: "Outdoor optical surveillance",
                    categoryHint: "IP_CAMERAS",
                    identityHints: {
                      manufacturerHint: "Hikvision",
                      brandHint: "Pro Series",
                      modelNumber: "DS-2CD2143G0-I",
                      mpn: "DS-2CD2143G0-I-4MM",
                    },
                    specificationHints: ["4K Resolution", "IR 30m", "IP67"],
                    confidence: 0.92,
                    evidence: [
                      {
                        url: "https://www.hikvision.com/en/products/IP-Products/Network-Cameras/DS-2CD2143G0-I/",
                        title: "DS-2CD2143G0-I Specification Sheet",
                        publisher: "Hikvision",
                        sourceType: "MANUFACTURER_DATASHEET",
                        claimSupport: ["Exact MPN and specs"],
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-openai-key",
      model: "gpt-4o-test",
      fetchFn: mockFetch,
    });

    const seed = await adapter.discoverSystem({ prompt: "CCTV Surveillance System" });

    expect(seed).toBeInstanceOf(SystemDiscoverySeed);
    expect(seed.id).toBe("cctv-system-01");
    expect(seed.nameEn).toBe("4K Enterprise IP Surveillance System");
    expect(seed.evidence).toHaveLength(1);
    expect(seed.evidence[0].url).toBe(
      "https://www.hikvision.com/en/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/"
    );

    expect(seed.components).toHaveLength(1);
    const comp = seed.components[0];
    expect(comp.key).toBe("ip_camera_4k");
    expect(comp.identityHints?.modelNumber).toBe("DS-2CD2143G0-I");
    expect(comp.identityHints?.mpn).toBe("DS-2CD2143G0-I-4MM");

    // Verify mock fetch arguments
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-openai-key");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-test");
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });

  it("throws error on API HTTP failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Internal AI Error",
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      fetchFn: mockFetch,
    });

    await expect(adapter.discoverSystem({ prompt: "Network switches" })).rejects.toThrow(
      /OpenAI Discovery API error \(500\)/
    );
  });

  it("throws error when returned payload fails seed evidence validation", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                id: "invalid-seed",
                seedType: "SYSTEM",
                nameEn: "System Without Evidence",
                confidence: 0.9,
                evidence: [], // Empty evidence!
              }),
            },
          },
        ],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      fetchFn: mockFetch,
    });

    await expect(adapter.discoverSystem({ prompt: "Fire alarm system" })).rejects.toThrow(
      /SystemDiscoverySeed requires at least one genuine evidence reference/i
    );
  });

  it("preserves exact model and MPN casing and special characters without mutation", () => {
    const rawPayload = {
      id: "seed-preserve-01",
      seedType: "SYSTEM",
      nameEn: "High-End Security System",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec Sheet",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_DATASHEET",
          claimSupport: ["Valid evidence"],
        },
      ],
      components: [
        {
          key: "cam_spec_1",
          componentType: "PRODUCT",
          nameEn: "Special Dome Camera",
          purpose: "Surveillance",
          identityHints: {
            manufacturerHint: "Acme Corp",
            modelNumber: "ACME-CAM/v2.1_4K-x10",
            mpn: "ACME-CAM-4K-x10-EU#01",
          },
          evidence: [
            {
              url: "https://example.com/cam-spec",
              title: "Cam Spec",
              publisher: "Vendor",
              sourceType: "MANUFACTURER_DATASHEET",
              claimSupport: ["Valid evidence"],
            },
          ],
        },
      ],
    };

    const seed = OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload);
    expect(seed.components[0].identityHints?.modelNumber).toBe("ACME-CAM/v2.1_4K-x10");
    expect(seed.components[0].identityHints?.mpn).toBe("ACME-CAM-4K-x10-EU#01");
  });
});
