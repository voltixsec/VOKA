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

  it("sends structured output request to OpenAI Responses API and parses valid SystemDiscoverySeed", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { url: "https://www.hikvision.com/en/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/", title: "Hikvision Network Camera Catalog" },
                { url: "https://www.hikvision.com/en/products/IP-Products/Network-Cameras/DS-2CD2143G0-I/", title: "DS-2CD2143G0-I Specification Sheet" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
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
                      sourceType: "MANUFACTURER_TECHNICAL",
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
                          sourceType: "MANUFACTURER_TECHNICAL",
                          claimSupport: ["Exact MPN and specs"],
                        },
                      ],
                    },
                  ],
                }),
              },
            ],
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

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers.Authorization).toBe("Bearer test-openai-key");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-test");
    expect(body.store).toBe(false);
    expect(body.instructions).toBeDefined();
    expect(body.instructions).toContain("governed product intelligence discovery engine");
    expect(body.input).toEqual([{ role: "user", content: expect.any(String) }]);
    expect(body.tools).toEqual([{ type: "web_search" }]);
    expect(body.temperature).toBe(0.1);
    expect(body.text).toBeDefined();
    expect(body.text.format).toBeDefined();
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.name).toBe("SystemDiscoverySeed");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema).toBeDefined();
  });

  it("uses Responses API structured output with canonical ResearchSourceType schema", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { url: "https://www.hikvision.com/en/products/IP-Products/", title: "Hikvision Catalog" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  id: "seed-structured",
                  seedType: "SYSTEM",
                  nameEn: "Structured Output System",
                  confidence: 0.9,
                  evidence: [
                    {
                      url: "https://www.hikvision.com/en/products/IP-Products/",
                      title: "Hikvision Catalog",
                      publisher: "Hikvision",
                      sourceType: "MANUFACTURER_TECHNICAL",
                      claimSupport: ["Valid claim"],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      model: "gpt-4o-test",
      fetchFn: mockFetch,
    });

    await adapter.discoverSystem({ prompt: "CCTV Cameras" });

    const [_url, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    
    expect(body.text).toBeDefined();
    expect(body.text.format).toBeDefined();
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.name).toBe("SystemDiscoverySeed");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema).toBeDefined();
    
    const schema = body.text.format.schema;
    const evidenceItemSchema = schema.properties.evidence.items;
    expect(evidenceItemSchema.properties.sourceType.enum).toEqual(
      expect.arrayContaining(["GOVERNMENT_AUTHORITY", "MANUFACTURER_TECHNICAL", "OTHER"])
    );
    expect(evidenceItemSchema.properties.sourceType.enum).not.toEqual(
      expect.arrayContaining(["MANUFACTURER_DATASHEET", "DISTRIBUTOR_CATALOG", "WEB_ARTICLE"])
    );
  });

  it("outgoing prompt excludes obsolete sourceType values", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { url: "https://www.hikvision.com/en/products/IP-Products/", title: "Hikvision Catalog" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  id: "seed-prompt-check",
                  seedType: "SYSTEM",
                  nameEn: "Prompt Check System",
                  confidence: 0.9,
                  evidence: [
                    {
                      url: "https://www.hikvision.com/en/products/IP-Products/",
                      title: "Hikvision Catalog",
                      publisher: "Hikvision",
                      sourceType: "MANUFACTURER_TECHNICAL",
                      claimSupport: ["Valid claim"],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      model: "gpt-4o-test",
      fetchFn: mockFetch,
    });

    await adapter.discoverSystem({ prompt: "CCTV Cameras" });

    const [_url, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    const systemContent = body.instructions;

    const obsoleteValues = [
      "MANUFACTURER_DATASHEET",
      "DISTRIBUTOR_CATALOG",
      "SPECIFICATION_STANDARD",
      "THIRD_PARTY_CERTIFICATION",
      "WEB_ARTICLE",
    ];

    for (const obsolete of obsoleteValues) {
      expect(systemContent).not.toContain(obsolete);
    }

    // Canonical values are enforced via JSON schema, not the prompt
    const schema = body.text.format.schema;
    const evidenceItemSchema = schema.properties.evidence.items;
    const canonicalValues = [
      "GOVERNMENT_AUTHORITY",
      "MANUFACTURER_TECHNICAL",
      "MANUFACTURER_PRODUCT",
      "STANDARDS_ORGANIZATION",
      "SPECIALIST_TECHNICAL",
      "LOCAL_DISTRIBUTOR",
      "SUPPLIER_DEALER",
      "MARKETPLACE",
      "SOCIAL_DISCOVERY",
      "OTHER",
    ];

    for (const canonical of canonicalValues) {
      expect(evidenceItemSchema.properties.sourceType.enum).toContain(canonical);
    }
  });

  it("stages payload with empty evidence when provider returns no usable web-search evidence", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  id: "seed-no-evidence",
                  seedType: "SYSTEM",
                  nameEn: "System Without Grounded Evidence",
                  confidence: 0.9,
                  evidence: [
                    {
                      url: "https://www.hikvision.com/en/products/IP-Products/",
                      title: "Hikvision Catalog",
                      publisher: "Hikvision",
                      sourceType: "MANUFACTURER_TECHNICAL",
                      claimSupport: ["Valid claim"],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      fetchFn: mockFetch,
    });

    const seed = await adapter.discoverSystem({ prompt: "CCTV System" });
    expect(seed.evidence).toEqual([]);
  });

  it("filters structured payload URLs not present in provider web-search citations", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { url: "https://www.hikvision.com/en/products/IP-Products/", title: "Hikvision Catalog" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  id: "seed-fabricated-url",
                  seedType: "SYSTEM",
                  nameEn: "System With Fabricated URL",
                  confidence: 0.9,
                  evidence: [
                    {
                      url: "https://fabricated.invalid/fake-datasheet",
                      title: "Fake Datasheet",
                      publisher: "Fake Publisher",
                      sourceType: "MANUFACTURER_TECHNICAL",
                      claimSupport: ["Fabricated claim"],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      fetchFn: mockFetch,
    });

    const seed = await adapter.discoverSystem({ prompt: "CCTV System" });
    expect(seed.evidence).toEqual([]);
  });

  it("accepts multiple legitimate URLs traceable to provider citations", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { url: "https://www.hikvision.com/en/products/IP-Products/", title: "Hikvision Catalog" },
                { url: "https://www.hikvision.com/en/products/IP-Products/Network-Cameras/DS-2CD2143G0-I/", title: "DS-2CD2143G0-I Spec" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  id: "seed-multi-url",
                  seedType: "SYSTEM",
                  nameEn: "Multi-URL System",
                  confidence: 0.9,
                  evidence: [
                    {
                      url: "https://www.hikvision.com/en/products/IP-Products/",
                      title: "Hikvision Catalog",
                      publisher: "Hikvision",
                      sourceType: "MANUFACTURER_TECHNICAL",
                      claimSupport: ["Catalog reference"],
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
                          sourceType: "MANUFACTURER_TECHNICAL",
                          claimSupport: ["Exact MPN and specs"],
                        },
                      ],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      model: "gpt-4o-test",
      fetchFn: mockFetch,
    });

    const seed = await adapter.discoverSystem({ prompt: "CCTV Surveillance System" });
    expect(seed.evidence).toHaveLength(1);
    expect(seed.components).toHaveLength(1);
    expect(seed.evidence[0].url).toBe("https://www.hikvision.com/en/products/IP-Products/");
    expect(seed.components[0].evidence[0].url).toBe("https://www.hikvision.com/en/products/IP-Products/Network-Cameras/DS-2CD2143G0-I/");
  });

  it("rejects payload with missing sourceType on seed evidence", () => {
    const rawPayload = {
      id: "seed-bad-sourcetype",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec Sheet",
          publisher: "Vendor",
          claimSupport: ["Valid evidence"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /missing required sourceType/i
    );
  });

  it("rejects payload with empty sourceType on seed evidence", () => {
    const rawPayload = {
      id: "seed-bad-sourcetype",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec Sheet",
          publisher: "Vendor",
          sourceType: "",
          claimSupport: ["Valid evidence"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /missing required sourceType/i
    );
  });

  it("rejects payload with unsupported sourceType on seed evidence", () => {
    const rawPayload = {
      id: "seed-bad-sourcetype",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec Sheet",
          publisher: "Vendor",
          sourceType: "UNSUPPORTED_TYPE",
          claimSupport: ["Valid evidence"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /unsupported sourceType: UNSUPPORTED_TYPE/i
    );
  });

  it("preserves valid supported sourceType values", () => {
    const rawPayload = {
      id: "seed-valid-sourcetype",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec Sheet",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid evidence"],
        },
      ],
      components: [
        {
          key: "comp-1",
          componentType: "PRODUCT",
          nameEn: "Test Component",
          confidence: 0.9,
          evidence: [
            {
              url: "https://example.com/comp-spec",
              title: "Comp Spec",
              publisher: "Vendor",
              sourceType: "GOVERNMENT_AUTHORITY",
              claimSupport: ["Valid claim"],
            },
          ],
        },
      ],
    };

    const seed = OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload);
    expect(seed.evidence[0].sourceType).toBe("MANUFACTURER_TECHNICAL");
    expect(seed.components[0].evidence[0].sourceType).toBe("GOVERNMENT_AUTHORITY");
  });

  it("rejects payload with missing sourceType on component evidence", () => {
    const rawPayload = {
      id: "seed-bad-sourcetype",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec Sheet",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid evidence"],
        },
      ],
      components: [
        {
          key: "comp-1",
          componentType: "PRODUCT",
          nameEn: "Test Component",
          confidence: 0.9,
          evidence: [
            {
              url: "https://example.com/comp-spec",
              title: "Comp Spec",
              publisher: "Vendor",
              claimSupport: ["Valid claim"],
            },
          ],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /missing required sourceType/i
    );
  });

  it("rejects payload with unsupported sourceType on component evidence", () => {
    const rawPayload = {
      id: "seed-bad-sourcetype",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec Sheet",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid evidence"],
        },
      ],
      components: [
        {
          key: "comp-1",
          componentType: "PRODUCT",
          nameEn: "Test Component",
          confidence: 0.9,
          evidence: [
            {
              url: "https://example.com/comp-spec",
              title: "Comp Spec",
              publisher: "Vendor",
              sourceType: "INVALID",
              claimSupport: ["Valid claim"],
            },
          ],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /unsupported sourceType: INVALID/i
    );
  });

  it("throws error when Responses API returns no output_text content", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      fetchFn: mockFetch,
    });

    await expect(adapter.discoverSystem({ prompt: "Network switches" })).rejects.toThrow(
      /OpenAI Discovery returned an empty or invalid message content/i
    );
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

  it("allows missing seed evidence and stages it for later review", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { url: "https://www.hikvision.com/en/products/IP-Products/", title: "Hikvision Catalog" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  id: "invalid-seed",
                  seedType: "SYSTEM",
                  nameEn: "System Without Evidence",
                  confidence: 0.9,
                  evidence: [],
                }),
              },
            ],
          },
        ],
      }),
    });

    const adapter = new OpenAiWebDiscoveryAdapter({
      apiKey: "test-key",
      fetchFn: mockFetch,
    });

    const seed = await adapter.discoverSystem({ prompt: "Fire alarm system" });
    expect(seed.evidence).toEqual([]);
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
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid evidence"],
        },
      ],
      components: [
        {
          key: "cam_spec_1",
          componentType: "PRODUCT",
          nameEn: "Special Dome Camera",
          purpose: "Surveillance",
          confidence: 0.9,
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
              sourceType: "MANUFACTURER_TECHNICAL",
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

  it("rejects payload with invalid seedType", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "INVALID",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /Invalid or missing seedType/i
    );
  });

  it("generates deterministic technical id when provider id is missing", () => {
    const rawPayload = {
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
    };

    const seed = OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload);
    expect(seed.id).toBe("discovered-system-test");
  });

  it("rejects payload with missing nameEn", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /missing required nameEn/i
    );
  });

  it("rejects payload with evidence missing url", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /missing required url/i
    );
  });

  it("rejects payload with evidence missing title", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /missing required title/i
    );
  });

  it("rejects payload with evidence missing publisher", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /missing required publisher/i
    );
  });

  it("rejects payload with evidence missing claimSupport", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /missing required claimSupport array/i
    );
  });

  it("rejects payload with non-HTTP evidence URL", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "ftp://example.com/spec",
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /must use HTTP or HTTPS/i
    );
  });

  it("rejects payload with malformed identityHints", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
      components: [
        {
          key: "comp-1",
          componentType: "PRODUCT",
          nameEn: "Test Component",
          confidence: 0.9,
          identityHints: "not-an-object",
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /not a valid object/i
    );
  });

  it("rejects payload with unsupported identityHints key", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
      components: [
        {
          key: "comp-1",
          componentType: "PRODUCT",
          nameEn: "Test Component",
          confidence: 0.9,
          identityHints: {
            modelNumber: "ABC",
            unsupportedKey: "bad",
          },
        },
      ],
    };

    expect(() => OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload)).toThrow(
      /unsupported key: unsupportedKey/i
    );
  });

  it("normalizes invalid component confidence to zero", () => {
    const rawPayload = {
      id: "seed-bad",
      seedType: "SYSTEM",
      nameEn: "Test",
      confidence: 0.9,
      evidence: [
        {
          url: "https://example.com/spec",
          title: "Spec",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_TECHNICAL",
          claimSupport: ["Valid"],
        },
      ],
      components: [
        {
          key: "comp-1",
          componentType: "PRODUCT",
          nameEn: "Test Component",
          confidence: 1.5,
        },
      ],
    };

    const seed = OpenAiWebDiscoveryAdapter.parseAndValidateSeed(rawPayload);
    expect(seed.components[0].confidence).toBe(0);
  });
});