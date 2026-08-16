import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantExtractor } from "../services/AISalesAssistantExtractor";
import { AISalesAssistantResolver } from "../services/AISalesAssistantResolver";
import type { ExtractedSalesIntent } from "../dto/AISalesAssistantDto";

describe("AI Sales Assistant - Extractor & Resolver", () => {
  it("extracts Arabic sales intent with customer mention, scope, and line items", async () => {
    const extractor = new AISalesAssistantExtractor();
    const prompt =
      "اعمل عرض سعر لشركة الكويت الوطنية للاتصالات 5 كاميرات IP بدقة 4K بسعر 45 د.ك مع التركيب والبرمجة";

    const { intent } = await extractor.extractIntent(prompt, "ar");

    expect(intent.customerMention).toContain("الكويت الوطنية للاتصالات");
    expect(intent.scopeType).toBe("SUPPLY_AND_INSTALLATION");
    expect(intent.lines.length).toBeGreaterThan(0);

    const cameraLine = intent.lines.find((l) => l.text.includes("كاميرات"));
    expect(cameraLine).toBeDefined();
    if (cameraLine) {
      expect(cameraLine.quantity).toBe(5);
      expect(cameraLine.requestedPrice).toBe(45);
    }
  });

  it("extracts English sales intent correctly", async () => {
    const extractor = new AISalesAssistantExtractor();
    const prompt =
      "Create a quotation for Gulf Tech Solution supply only 10 units NVR 16 Channels at 120 KWD";

    const { intent } = await extractor.extractIntent(prompt, "en");

    expect(intent.customerMention).toContain("Gulf Tech Solution");
    expect(intent.scopeType).toBe("SUPPLY_ONLY");
    expect(intent.lines.length).toBeGreaterThan(0);

    const nvrLine = intent.lines[0];
    expect(nvrLine.quantity).toBe(10);
    expect(nvrLine.requestedPrice).toBe(120);
  });

  it("resolves proposal with repository dependencies", async () => {
    const dependencies = {
      companies: {
        findById: vi.fn().mockResolvedValue({
          id: "comp-1",
          defaultCurrency: "KWD",
        }),
      },
      customers: {
        findAll: vi.fn().mockResolvedValue([
          {
            id: "cust-123",
            code: "CUST-001",
            name: "شركة الكويت الوطنية للاتصالات",
            email: "info@knt.kw",
            phone: "+96522001122",
            status: "ACTIVE",
          },
        ]),
      },
      catalogItems: {
        findAll: vi.fn().mockResolvedValue([
          {
            id: "cat-456",
            companyId: "comp-1",
            code: "CAM-01",
            name: "كاميرا IP بدقة 4K",
            type: "PRODUCT",
            taxRateId: null,
            isActive: true,
          },
        ]),
      },
      units: {
        findById: vi.fn().mockResolvedValue({
          id: "unit-1",
          symbol: "PCS",
          nameAr: "قطعة",
          nameEn: "PCS",
          isActive: true,
        }),
        findBySymbol: vi.fn().mockResolvedValue(null),
      },
      quotationReferences: {
        resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()),
      },
      pricing: {
        resolvePriceListId: vi.fn().mockResolvedValue(null),
        resolveUnitPrice: vi.fn().mockResolvedValue(45),
      },
    };

    const resolver = new AISalesAssistantResolver(dependencies as any);
    const intent: ExtractedSalesIntent = {
      sourceLocale: "ar",
      customerMention: "شركة الكويت الوطنية للاتصالات",
      scopeType: "SUPPLY_AND_INSTALLATION",
      currencyCode: "KWD",
      lines: [
        {
          text: "كاميرا IP بدقة 4K",
          quantity: 5,
          requestedPrice: 45,
          typeIntent: "PRODUCT",
        },
      ],
    };

    const proposal = await resolver.resolveProposal(
      "comp-1",
      intent,
      "ar",
      "heuristic",
    );

    expect(proposal.customer.status).toBe("MATCHED");
    expect(proposal.customer.id).toBe("cust-123");
    expect(proposal.lines[0].resolutionStatus).toBe("MATCHED");
    expect(proposal.lines[0].catalogItemId).toBe("cat-456");
    expect(proposal.financials).not.toBeNull();
    expect(proposal.financials?.subtotal).toBe(225);
    expect(proposal.financials?.totalAmount).toBe(225);
  });
});
