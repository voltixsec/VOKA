import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantResolver } from "../services/AISalesAssistantResolver";
import { AISalesAssistantService } from "../services/AISalesAssistantService";
import type { ExtractedSalesIntent } from "../dto/AISalesAssistantDto";

describe("Phase 6.1 Commercial Domain Rules & Edge Cases", () => {
  const mockCompany = {
    id: "comp-1",
    defaultCurrency: "KWD",
  };

  const createDependencies = (overrides = {}) => ({
    companies: {
      findById: vi.fn().mockResolvedValue(mockCompany),
    },
    customers: {
      findAll: vi.fn().mockResolvedValue([
        {
          id: "cust-1",
          code: "CUST-001",
          name: "Kuwait Telecom",
          email: "info@telecom.kw",
          phone: "99887766",
          status: "ACTIVE",
        },
      ]),
    },
    catalogItems: {
      findAll: vi.fn().mockResolvedValue([
        {
          id: "cat-1",
          companyId: "comp-1",
          code: "CAM-4K",
          name: "4K Camera",
          type: "PRODUCT",
          taxRateId: "tax-1",
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
      resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map([["tax-1", 5]])),
    },
    pricing: {
      resolvePriceListId: vi.fn().mockResolvedValue("list-1"),
      resolveUnitPrice: vi.fn().mockResolvedValue(100),
    },
    ...overrides,
  });

  describe("Zero Price Preservation (Blocker 3)", () => {
    it("preserves explicitly configured canonical 0 price without fallback", async () => {
      const deps = createDependencies({
        pricing: {
          resolvePriceListId: vi.fn().mockResolvedValue("list-1"),
          resolveUnitPrice: vi.fn().mockResolvedValue(0), // Canonical 0 price!
        },
      });

      const resolver = new AISalesAssistantResolver(deps as any);
      const intent: ExtractedSalesIntent = {
        sourceLocale: "en",
        customerMention: "Kuwait Telecom",
        lines: [
          {
            text: "4K Camera",
            quantity: 2,
            requestedPrice: 50, // User asked for 50
            typeIntent: "PRODUCT",
          },
        ],
      };

      const proposal = await resolver.resolveProposal("comp-1", intent, "en", "heuristic");

      // Canonical price must be preserved as 0 (not 50 or null)
      expect(proposal.lines[0].unitPrice).toBe(0);
      expect(proposal.lines[0].requestedPrice).toBe(50);
      expect(proposal.lines[0].subtotal).toBe(0);
    });
  });

  describe("Non-Authoritative Requested Price (Blocker 4)", () => {
    it("uses PricingService canonical unit price instead of requested price", async () => {
      const deps = createDependencies({
        pricing: {
          resolvePriceListId: vi.fn().mockResolvedValue("list-1"),
          resolveUnitPrice: vi.fn().mockResolvedValue(120), // Canonical price is 120
        },
      });

      const resolver = new AISalesAssistantResolver(deps as any);
      const intent: ExtractedSalesIntent = {
        sourceLocale: "en",
        customerMention: "Kuwait Telecom",
        lines: [
          {
            text: "4K Camera",
            quantity: 10,
            requestedPrice: 45, // Untrusted requested price
            typeIntent: "PRODUCT",
          },
        ],
      };

      const proposal = await resolver.resolveProposal("comp-1", intent, "en", "heuristic");

      expect(proposal.lines[0].unitPrice).toBe(120);
      expect(proposal.lines[0].requestedPrice).toBe(45);
      expect(proposal.lines[0].subtotal).toBe(1200);
    });
  });

  describe("Catalog Ambiguity (Blocker 5)", () => {
    it("flags resolutionStatus as AMBIGUOUS and nulls catalogItemId when multiple exact matches exist", async () => {
      const deps = createDependencies({
        catalogItems: {
          findAll: vi.fn().mockResolvedValue([
            { id: "cat-1", code: "CAM-01", name: "Camera 4K", type: "PRODUCT", isActive: true },
            { id: "cat-2", code: "CAM-02", name: "Camera 4K", type: "PRODUCT", isActive: true },
          ]),
        },
      });

      const resolver = new AISalesAssistantResolver(deps as any);
      const intent: ExtractedSalesIntent = {
        sourceLocale: "en",
        lines: [{ text: "Camera 4K", quantity: 1, typeIntent: "PRODUCT" }],
      };

      const proposal = await resolver.resolveProposal("comp-1", intent, "en", "heuristic");

      expect(proposal.lines[0].resolutionStatus).toBe("AMBIGUOUS");
      expect(proposal.lines[0].catalogItemId).toBeNull();
      expect(proposal.lines[0].catalogCandidates.length).toBe(2);
      expect(proposal.lines[0].reviewRequired).toBe(true);
      expect(proposal.reviewRequired).toBe(true);
    });
  });

  describe("Customer Resolution (Blocker 2)", () => {
    it("returns AMBIGUOUS status when multiple customers match without auto-creating any customer", async () => {
      const deps = createDependencies({
        customers: {
          findAll: vi.fn().mockResolvedValue([
            { id: "cust-1", code: "C1", name: "Gulf Tech Trading", email: "a@gulf.com", status: "ACTIVE" },
            { id: "cust-2", code: "C2", name: "Gulf Tech Solutions", email: "b@gulf.com", status: "ACTIVE" },
          ]),
        },
      });

      const resolver = new AISalesAssistantResolver(deps as any);
      const intent: ExtractedSalesIntent = {
        sourceLocale: "en",
        customerMention: "Gulf Tech",
        lines: [],
      };

      const proposal = await resolver.resolveProposal("comp-1", intent, "en", "heuristic");

      expect(proposal.customer.status).toBe("AMBIGUOUS");
      expect(proposal.customer.id).toBeNull();
      expect(proposal.customer.candidates.length).toBe(2);
      expect(proposal.customer.reviewRequired).toBe(true);
    });

    it("returns MISSING status when no customer matches without auto-creating any customer", async () => {
      const deps = createDependencies({
        customers: {
          findAll: vi.fn().mockResolvedValue([]),
        },
      });

      const resolver = new AISalesAssistantResolver(deps as any);
      const intent: ExtractedSalesIntent = {
        sourceLocale: "en",
        customerMention: "NonExistent Corp",
        lines: [],
      };

      const proposal = await resolver.resolveProposal("comp-1", intent, "en", "heuristic");

      expect(proposal.customer.status).toBe("MISSING");
      expect(proposal.customer.id).toBeNull();
      expect(proposal.customer.reviewRequired).toBe(true);
    });
  });

  describe("Tax and Financial Totals (Blocker 7)", () => {
    it("computes accurate subtotal, taxAmount, and totalAmount using server tax resolution", async () => {
      const deps = createDependencies();
      const resolver = new AISalesAssistantResolver(deps as any);

      const intent: ExtractedSalesIntent = {
        sourceLocale: "en",
        customerMention: "Kuwait Telecom",
        lines: [
          {
            text: "4K Camera",
            quantity: 5, // 5 * 100 = 500
            typeIntent: "PRODUCT",
          },
        ],
      };

      const proposal = await resolver.resolveProposal("comp-1", intent, "en", "heuristic");

      expect(proposal.financials).toEqual({
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 25, // 5% of 500 = 25
        totalAmount: 525,
      });
    });
  });

  describe("Provider Fallback Handling (Blocker 1)", () => {
    it("falls back gracefully to heuristic extractor if provider throws an error", async () => {
      const mockProvider = {
        extractIntent: vi.fn().mockRejectedValue(new Error("LLM timeout")),
      };

      const deps = createDependencies();
      const service = new AISalesAssistantService(deps as any, mockProvider as any);

      const draft = await service.generateDraftProposal({
        companyId: "comp-1",
        prompt: "Create a quotation for Kuwait Telecom 5 units 4K Camera at 100 KWD",
        sourceLocale: "en",
      });

      expect(draft.metadata.extractionMode).toBe("heuristic");
      expect(draft.metadata.warnings[0]).toContain("conservative heuristic extraction was used");
      expect(draft.lines.length).toBeGreaterThan(0);
    });
  });
});
