import { describe, expect, it, vi } from "vitest";
import { Quotation } from "../../../../domain/quotation/entities/Quotation";
import { LocalizationStatus } from "../../../../domain/quotation/types/LocalizationStatus";
import { QuotationLocalizationJobRunner } from "../../../../infrastructure/translation/quotation/QuotationLocalizationJobRunner";
import { analyzeQuotationLocalization } from "../QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "../QuotationLocalizationSourceSignature";
import { serializeQuotation } from "../../../../../app/api/quotations/serialize-quotation";
import {
  checkQuotationLocalizationIncompleteness,
  QuotationLocalizationRepairService,
} from "../QuotationLocalizationRepairService";
import type { IQuotationRepository } from "../../repositories/IQuotationRepository";

type UnknownRecord = Record<string, unknown>;

function buildSnapshot(quotation: Quotation): UnknownRecord {
  return {
    customer: quotation.customer.toJSON(),
    projectName: quotation.projectName,
    projectNameAr: quotation.projectNameAr,
    projectNameEn: quotation.projectNameEn,
    attentionName: quotation.attentionName,
    attentionNameAr: quotation.attentionNameAr,
    attentionNameEn: quotation.attentionNameEn,
    subjectAr: quotation.subjectAr,
    subjectEn: quotation.subjectEn,
    briefAr: quotation.briefAr,
    briefEn: quotation.briefEn,
    notes: quotation.notes,
    notesAr: quotation.notesAr,
    notesEn: quotation.notesEn,
    termsAndConditions: quotation.termsAndConditions,
    termsAndConditionsAr: quotation.termsAndConditionsAr,
    termsAndConditionsEn: quotation.termsAndConditionsEn,
    lines: quotation.lines.map((line) => ({
      id: line.id,
      itemName: line.itemName,
      itemNameAr: line.itemNameAr,
      itemNameEn: line.itemNameEn,
      description: line.description,
      descriptionAr: line.descriptionAr,
      descriptionEn: line.descriptionEn,
      unitName: line.unitName,
      unitNameAr: line.unitNameAr,
      unitNameEn: line.unitNameEn,
    })),
  };
}

describe("Phase 6.4A Quotation Localization Integrity", () => {
  type QuotationTestOverrides = Partial<Parameters<typeof Quotation.restore>[0]> & {
    itemNameAr?: string | null;
    itemNameEn?: string | null;
  };

  function createSampleQuotation(overrides?: QuotationTestOverrides) {
    const { itemNameAr, itemNameEn, ...quotationProps } = overrides ?? {};
    return Quotation.restore({
      id: "q-100",
      companyId: "comp-1",
      customerId: "cust-1",
      number: "Q-2025-001",
      status: "DRAFT",
      currencyCode: "KWD",
      customer: { name: "Ahmad Security Co." },
      projectName: "Project Alpha",
      projectNameAr: quotationProps.projectNameAr !== undefined ? quotationProps.projectNameAr : "مشروع ألفا",
      projectNameEn: quotationProps.projectNameEn !== undefined ? quotationProps.projectNameEn : "Project Alpha",
      attentionName: "Eng. Refaat",
      attentionNameAr: quotationProps.attentionNameAr !== undefined ? quotationProps.attentionNameAr : "م. رفعت",
      attentionNameEn: quotationProps.attentionNameEn !== undefined ? quotationProps.attentionNameEn : "Eng. Refaat",
      localizationStatus: quotationProps.localizationStatus ?? LocalizationStatus.COMPLETED,
      localizationSourceLocale: quotationProps.localizationSourceLocale ?? "ar",
      lines: [
        {
          id: "line-1",
          position: 1,
          type: "PRODUCT",
          itemName: "IP Camera 4K",
          itemNameAr: itemNameAr !== undefined ? itemNameAr : "كاميرا مراقبة 4K",
          itemNameEn: itemNameEn !== undefined ? itemNameEn : "IP Camera 4K",
          quantity: 2,
          unitPrice: 150,
        },
      ],
      ...quotationProps,
    });
  }

  function mockRepo(quotation: Quotation): IQuotationRepository {
    let current = quotation;
    return {
      claimLocalization: vi.fn().mockImplementation(async () => {
        const snapshot = buildSnapshot(current);
        const analysis = analyzeQuotationLocalization(
          snapshot,
          current.localizationSourceLocale ?? undefined,
        );
        const sig = createQuotationLocalizationSourceSignature(analysis);
        return {
          claimToken: "token-abc",
          sourceSignature: sig,
        };
      }),
      findById: vi.fn().mockImplementation(async () => current),
      completeLocalization: vi.fn().mockImplementation(async (params) => {
        current = Quotation.restore({
          ...current,
          id: current.id!,
          number: current.number.toString(),
          customer: current.customer.toJSON(),
          projectNameAr: params.header.projectNameAr ?? current.projectNameAr,
          projectNameEn: params.header.projectNameEn ?? current.projectNameEn,
          attentionNameAr: params.header.attentionNameAr ?? current.attentionNameAr,
          attentionNameEn: params.header.attentionNameEn ?? current.attentionNameEn,
          localizationStatus: LocalizationStatus.COMPLETED,
          lines: current.lines.map((l) => ({
            id: l.id,
            position: l.position,
            type: l.type,
            itemName: l.itemName,
            itemNameAr: params.lines.find((pl: { id: string }) => pl.id === l.id)?.itemNameAr ?? l.itemNameAr,
            itemNameEn: params.lines.find((pl: { id: string }) => pl.id === l.id)?.itemNameEn ?? l.itemNameEn,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        });
        return true;
      }),
      failLocalization: vi.fn().mockImplementation(async (params) => {
        current = Quotation.restore({
          ...current,
          id: current.id!,
          number: current.number.toString(),
          customer: current.customer.toJSON(),
          localizationStatus: LocalizationStatus.FAILED,
          localizationLastError: params.errorCode,
          lines: current.lines.map((l) => ({
            id: l.id,
            position: l.position,
            type: l.type,
            itemName: l.itemName,
            itemNameAr: l.itemNameAr,
            itemNameEn: l.itemNameEn,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        });
        return true;
      }),
      update: vi.fn().mockImplementation(async (_companyId, updatedQuotation) => {
        current = updatedQuotation;
      }),
      save: vi.fn(),
      existsByNumber: vi.fn(),
    } as unknown as IQuotationRepository;
  }

  it("A: Arabic source with valid English translation => localized English fields persisted & status COMPLETED", async () => {
    const quote = createSampleQuotation({
      projectNameAr: "برج الكويت",
      projectNameEn: null,
      attentionNameAr: "محمد علي",
      attentionNameEn: null,
      itemNameAr: "كاميرا",
      itemNameEn: null,
      localizationSourceLocale: "ar",
      localizationStatus: LocalizationStatus.PENDING,
    });

    const repo = mockRepo(quote);
    const mockLocalize = vi.fn().mockResolvedValue({
      customer: { nameAr: "Ahmad Security Co.", nameEn: "Ahmad Security Co." },
      projectNameAr: "برج الكويت",
      projectNameEn: "Kuwait Tower",
      attentionNameAr: "محمد علي",
      attentionNameEn: "Mohamed Ali",
      lines: [
        {
          id: "line-1",
          itemNameAr: "كاميرا",
          itemNameEn: "Camera",
        },
      ],
    });

    const runner = new QuotationLocalizationJobRunner(repo, mockLocalize);
    const result = await runner.run({ companyId: "comp-1", quotationId: "q-100" });

    expect(result).toBe("COMPLETED");
    const updated = await repo.findById("comp-1", "q-100");
    expect(updated?.localizationStatus).toBe(LocalizationStatus.COMPLETED);
    expect(updated?.projectNameEn).toBe("Kuwait Tower");
    expect(updated?.attentionNameEn).toBe("Mohamed Ali");
    expect(updated?.lines[0].itemNameEn).toBe("Camera");
  });

  it("B: English source with valid Arabic translation => localized Arabic fields persisted & status COMPLETED", async () => {
    const quote = createSampleQuotation({
      projectNameAr: null,
      projectNameEn: "Salmiya Mall",
      attentionNameAr: null,
      attentionNameEn: "John Smith",
      itemNameAr: null,
      itemNameEn: "Surveillance Server",
      localizationSourceLocale: "en",
      localizationStatus: LocalizationStatus.PENDING,
    });

    const repo = mockRepo(quote);
    const mockLocalize = vi.fn().mockResolvedValue({
      customer: { nameAr: "Ahmad Security Co.", nameEn: "Ahmad Security Co." },
      projectNameAr: "مجمع السالمية",
      projectNameEn: "Salmiya Mall",
      attentionNameAr: "جون سميث",
      attentionNameEn: "John Smith",
      lines: [
        {
          id: "line-1",
          itemNameAr: "خادم مراقبة",
          itemNameEn: "Surveillance Server",
        },
      ],
    });

    const runner = new QuotationLocalizationJobRunner(repo, mockLocalize);
    const result = await runner.run({ companyId: "comp-1", quotationId: "q-100" });

    expect(result).toBe("COMPLETED");
    const updated = await repo.findById("comp-1", "q-100");
    expect(updated?.localizationStatus).toBe(LocalizationStatus.COMPLETED);
    expect(updated?.projectNameAr).toBe("مجمع السالمية");
    expect(updated?.attentionNameAr).toBe("جون سميث");
    expect(updated?.lines[0].itemNameAr).toBe("خادم مراقبة");
  });

  it("C: Provider returns valid JSON but omits one required translated value => NOT COMPLETED & safe failure", async () => {
    const quote = createSampleQuotation({
      projectNameAr: "برج الحمراء",
      projectNameEn: null,
      attentionNameAr: "خالد سعيد",
      attentionNameEn: null,
      itemNameAr: "جهاز تسجيل",
      itemNameEn: null,
      localizationSourceLocale: "ar",
      localizationStatus: LocalizationStatus.PENDING,
    });

    const repo = mockRepo(quote);
    const mockLocalize = vi.fn().mockResolvedValue({
      customer: { nameAr: "Ahmad Security Co.", nameEn: "Ahmad Security Co." },
      projectNameAr: "برج الحمراء",
      projectNameEn: "Al Hamra Tower",
      attentionNameAr: "خالد سعيد",
      attentionNameEn: null, // Omitted required translation
      lines: [
        {
          id: "line-1",
          itemNameAr: "جهاز تسجيل",
          itemNameEn: "Recorder",
        },
      ],
    });

    const runner = new QuotationLocalizationJobRunner(repo, mockLocalize);
    const result = await runner.run({ companyId: "comp-1", quotationId: "q-100" });

    expect(result).toBe("FAILED");
    expect(repo.failLocalization).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "TRANSLATION_INVALID_RESPONSE",
      }),
    );
  });

  it("D: Provider returns blank required translated value => NOT COMPLETED", async () => {
    const quote = createSampleQuotation({
      projectNameAr: "مستشفى السلام",
      projectNameEn: null,
      itemNameAr: "شاشة عرض",
      itemNameEn: null,
      localizationSourceLocale: "ar",
      localizationStatus: LocalizationStatus.PENDING,
    });

    const repo = mockRepo(quote);
    const mockLocalize = vi.fn().mockResolvedValue({
      customer: { nameAr: "Ahmad Security Co.", nameEn: "Ahmad Security Co." },
      projectNameAr: "مستشفى السلام",
      projectNameEn: "  ", // Blank translation
      lines: [
        {
          id: "line-1",
          itemNameAr: "شاشة عرض",
          itemNameEn: "Monitor",
        },
      ],
    });

    const runner = new QuotationLocalizationJobRunner(repo, mockLocalize);
    const result = await runner.run({ companyId: "comp-1", quotationId: "q-100" });

    expect(result).toBe("FAILED");
    expect(repo.failLocalization).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "TRANSLATION_INVALID_RESPONSE",
      }),
    );
  });

  it("E: Translation data incomplete but serializer called with locale => broken localization does not falsely display opposite language on COMPLETED status", () => {
    const brokenQuote = createSampleQuotation({
      projectNameAr: "مشروع النور",
      projectNameEn: null, // Missing English translation
      localizationStatus: LocalizationStatus.COMPLETED,
    });

    const serializedEn = serializeQuotation(brokenQuote, "en");
    // When localizationStatus is COMPLETED, asking for English must return null when projectNameEn is missing, not Arabic fallback "مشروع النور"
    expect(serializedEn.projectName).toBeNull();
  });

  it("F: Old editable DRAFT with false/broken COMPLETED localization => detected & safely re-localized", async () => {
    const brokenDraft = createSampleQuotation({
      status: "DRAFT",
      projectNameAr: "مبنى التجارية",
      projectNameEn: null, // missing target
      localizationStatus: LocalizationStatus.COMPLETED,
    });

    const check = checkQuotationLocalizationIncompleteness(brokenDraft);
    expect(check.isBrokenCompleted).toBe(true);

    const repo = mockRepo(brokenDraft);
    const mockLocalize = vi.fn().mockResolvedValue({
      customer: { nameAr: "Ahmad Security Co.", nameEn: "Ahmad Security Co." },
      projectNameAr: "مبنى التجارية",
      projectNameEn: "Commercial Building",
      attentionNameAr: "م. رفعت",
      attentionNameEn: "Eng. Refaat",
      lines: [
        {
          id: "line-1",
          itemNameAr: "كاميرا مراقبة 4K",
          itemNameEn: "IP Camera 4K",
        },
      ],
    });

    const runner = new QuotationLocalizationJobRunner(repo, mockLocalize);
    const repairService = new QuotationLocalizationRepairService(repo, runner);

    const repairResult = await repairService.repairDraftQuotation(brokenDraft);
    expect(repairResult.repaired).toBe(true);

    expect(repo.update).toHaveBeenCalled();
    expect(repo.claimLocalization).toHaveBeenCalled();
    expect(repo.completeLocalization).toHaveBeenCalled();

    const updated = await repo.findById("comp-1", "q-100");
    expect(updated?.localizationStatus).toBe(LocalizationStatus.COMPLETED);
    expect(updated?.projectNameEn).toBe("Commercial Building");
  });

  it("G: APPROVED quotation => repair/re-localization logic strictly refuses mutation of approved snapshot", async () => {
    const approvedQuote = createSampleQuotation({
      status: "APPROVED",
      projectNameAr: "مشروع كبيـر",
      projectNameEn: null,
      localizationStatus: LocalizationStatus.COMPLETED,
    });

    const repo = mockRepo(approvedQuote);
    const runner = new QuotationLocalizationJobRunner(repo, vi.fn());
    const repairService = new QuotationLocalizationRepairService(repo, runner);

    const repairResult = await repairService.repairDraftQuotation(approvedQuote);
    expect(repairResult.repaired).toBe(false);
    if (!repairResult.repaired) {
      expect(repairResult.reason).toBe("APPROVED_IMMUTABLE");
    }

    // Verify repository claim / complete were never called
    expect(repo.claimLocalization).not.toHaveBeenCalled();
    expect(repo.completeLocalization).not.toHaveBeenCalled();
  });
});
