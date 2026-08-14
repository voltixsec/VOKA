import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { Quotation } from "../../../domain/quotation";
import { localizeQuotationDraft } from "../../../infrastructure/translation/quotation/localizeQuotationDraft";
import type { TranslationPort } from "../../translation/ports/TranslationPort";
import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import { UpdateQuotationUseCase } from "../use-cases/UpdateQuotationUseCase";

const mockTranslationPort: TranslationPort = {
  translateMany: vi.fn(),
};

vi.mock(
  "../../../infrastructure/translation/createTranslationPort",
  () => ({
    createTranslationPort: () => mockTranslationPort,
  }),
);

function createReferenceValidator(): IQuotationReferenceValidator {
  return {
    findInvalidReference: vi.fn().mockResolvedValue(null),
    getCustomerSnapshot: vi.fn().mockResolvedValue({
      name: "Persisted Customer",
    }),
    resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()),
    listAvailableTaxRates: vi.fn().mockResolvedValue([]),
  };
}

function createRepository(quotation: Quotation): IQuotationRepository {
  let storedQuotation = quotation;

  return {
    existsByNumber: vi.fn().mockResolvedValue(false),
    save: vi.fn().mockImplementation(async (value: Quotation) => {
      storedQuotation = value;
      return value;
    }),
    findById: vi.fn().mockImplementation(async () => storedQuotation),
    findAll: vi.fn(),
    update: vi.fn().mockImplementation(async (_companyId: string, updated: Quotation) => {
      storedQuotation = updated;
    }),
    delete: vi.fn(),
    claimLocalization: vi.fn(),
    completeLocalization: vi.fn(),
    failLocalization: vi.fn(),
  };
}

function createSampleQuotation(): Quotation {
  return Quotation.restore({
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    issueDate: new Date("2026-08-04T00:00:00.000Z"),
    customer: {
      name: "Acme Corp",
      nameAr: "شركة أكمي",
      nameEn: "Acme Corp",
    },
    subjectAr: "عرض سعر كاميرات",
    subjectEn: "Camera Quotation",
    briefAr: "ملخص العرض",
    briefEn: "Proposal Brief",
    projectNameAr: "مشروع الشويخ",
    projectNameEn: "Shuwaikh Project",
    attentionNameAr: "السيد محمد",
    attentionNameEn: "Mr. Mohamed",
    notesAr: "ملاحظات هامة",
    notesEn: "Important Notes",
    termsAndConditionsAr: "الشروط والأحكام",
    termsAndConditionsEn: "Terms and Conditions",
    lines: [
      {
        id: "line-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Hikvision Camera",
        itemNameAr: "كاميرا هيكفيجن",
        itemNameEn: "Hikvision Camera",
        description: "8 Megapixel Camera",
        descriptionAr: "كاميرا 8 ميجابكسل",
        descriptionEn: "8 Megapixel Camera",
        unitName: "Piece",
        unitNameAr: "حبة",
        unitNameEn: "Piece",
        quantity: 2,
        unitPrice: 50,
      },
      {
        id: "line-2",
        position: 2,
        type: "SERVICE",
        itemName: "Installation",
        itemNameAr: "تركيب وبرمجة",
        itemNameEn: "Installation and Programming",
        description: "Full setup",
        descriptionAr: "إعداد كامل",
        descriptionEn: "Full setup",
        unitName: "Service",
        unitNameAr: "خدمة",
        unitNameEn: "Service",
        quantity: 1,
        unitPrice: 100,
      },
    ],
  });
}

describe("Changed-fields-only localization (Field-specific Target Invalidation)", () => {
  it("1. Changing only itemNameAr on one existing line clears only that line's itemNameEn and preserves all other localized targets", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    // Update only itemNameAr on line-1
    const updateResult = await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [
        {
          id: "line-1",
          position: 1,
          type: "PRODUCT",
          itemName: "Hikvision Camera",
          itemNameAr: "كاميرا هيكفيجن 8 ميجا", // CHANGED
          quantity: 2,
          unitPrice: 50,
        },
        {
          id: "line-2",
          position: 2,
          type: "SERVICE",
          itemName: "Installation",
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });

    expect(updateResult.success).toBe(true);

    const updatedQuotation = await repository.findById("company-1", "quotation-1");
    expect(updatedQuotation).not.toBeNull();

    // Verify line-1 itemNameEn was invalidated (cleared) while other localized fields were preserved
    const line1 = updatedQuotation!.lines[0];
    expect(line1.itemNameAr).toBe("كاميرا هيكفيجن 8 ميجا");
    expect(line1.itemNameEn).toBeNull(); // Invalidated!
    expect(line1.descriptionAr).toBe("كاميرا 8 ميجابكسل");
    expect(line1.descriptionEn).toBe("8 Megapixel Camera"); // Preserved!
    expect(line1.unitNameAr).toBe("حبة");
    expect(line1.unitNameEn).toBe("Piece"); // Preserved!

    // Verify line-2 was completely preserved
    const line2 = updatedQuotation!.lines[1];
    expect(line2.itemNameAr).toBe("تركيب وبرمجة");
    expect(line2.itemNameEn).toBe("Installation and Programming"); // Preserved!

    // Now test background localization on the saved snapshot
    vi.mocked(mockTranslationPort.translateMany).mockResolvedValueOnce({
      line_0_item_name: "Hikvision 8 Mega Camera",
    });

    const snapshot = {
      lines: updatedQuotation!.lines.map((l) => ({
        id: l.id,
        position: l.position,
        itemNameAr: l.itemNameAr,
        itemNameEn: l.itemNameEn,
        descriptionAr: l.descriptionAr,
        descriptionEn: l.descriptionEn,
        unitNameAr: l.unitNameAr,
        unitNameEn: l.unitNameEn,
      })),
      subjectAr: updatedQuotation!.subjectAr,
      subjectEn: updatedQuotation!.subjectEn,
      notesAr: updatedQuotation!.notesAr,
      notesEn: updatedQuotation!.notesEn,
    };

    await localizeQuotationDraft(snapshot);

    // translateMany should receive EXACTLY 1 item (only line_0_item_name)
    expect(mockTranslationPort.translateMany).toHaveBeenCalledOnce();
    const request = vi.mocked(mockTranslationPort.translateMany).mock.calls[0][0];
    expect(request.items).toHaveLength(1);
    expect(request.items[0]).toEqual({
      key: "line_0_item_name",
      text: "كاميرا هيكفيجن 8 ميجا",
    });
  });

  it("2. Changing only descriptionAr invalidates only descriptionEn", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [
        {
          id: "line-1",
          position: 1,
          type: "PRODUCT",
          itemName: "Hikvision Camera",
          quantity: 2,
          unitPrice: 50,
          descriptionAr: "وصف جديد للكاميرا", // CHANGED
        },
        {
          id: "line-2",
          position: 2,
          type: "SERVICE",
          itemName: "Installation",
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });

    const updated = await repository.findById("company-1", "quotation-1");
    const line1 = updated!.lines[0];
    expect(line1.itemNameEn).toBe("Hikvision Camera"); // Preserved!
    expect(line1.descriptionAr).toBe("وصف جديد للكاميرا");
    expect(line1.descriptionEn).toBeNull(); // Invalidated!
    expect(line1.unitNameEn).toBe("Piece"); // Preserved!
  });

  it("3. Changing only unitNameAr invalidates only unitNameEn", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [
        {
          id: "line-1",
          position: 1,
          type: "PRODUCT",
          itemName: "Hikvision Camera",
          quantity: 2,
          unitPrice: 50,
          unitNameAr: "طقم", // CHANGED
        },
        {
          id: "line-2",
          position: 2,
          type: "SERVICE",
          itemName: "Installation",
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });

    const updated = await repository.findById("company-1", "quotation-1");
    const line1 = updated!.lines[0];
    expect(line1.itemNameEn).toBe("Hikvision Camera"); // Preserved!
    expect(line1.descriptionEn).toBe("8 Megapixel Camera"); // Preserved!
    expect(line1.unitNameAr).toBe("طقم");
    expect(line1.unitNameEn).toBeNull(); // Invalidated!
  });

  it("4. Changing one proposal field such as subjectAr invalidates only subjectEn", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: initialQuotation.lines.map((l) => ({
        id: l.id,
        position: l.position,
        type: l.type,
        itemName: l.itemName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      subjectAr: "عرض أسعار معدل", // CHANGED
    });

    const updated = await repository.findById("company-1", "quotation-1");
    expect(updated!.subjectAr).toBe("عرض أسعار معدل");
    expect(updated!.subjectEn).toBeNull(); // Invalidated!
    expect(updated!.briefEn).toBe("Proposal Brief"); // Preserved!
    expect(updated!.notesEn).toBe("Important Notes"); // Preserved!
  });

  it("5. Unchanged source text does not invalidate target and does not call AI", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    // Update with exact same text values
    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [
        {
          id: "line-1",
          position: 1,
          type: "PRODUCT",
          itemName: "Hikvision Camera",
          quantity: 2,
          unitPrice: 50,
          itemNameAr: "كاميرا هيكفيجن", // Same as initial
        },
      ],
    });

    const updated = await repository.findById("company-1", "quotation-1");
    expect(updated!.lines[0].itemNameEn).toBe("Hikvision Camera"); // Preserved!

    vi.mocked(mockTranslationPort.translateMany).mockClear();

    const snapshot = {
      lines: updated!.lines.map((l) => ({
        itemNameAr: l.itemNameAr,
        itemNameEn: l.itemNameEn,
      })),
    };

    await localizeQuotationDraft(snapshot);
    expect(mockTranslationPort.translateMany).not.toHaveBeenCalled();
  });

  it("6. Commercial-only changes (quantity, unitPrice, discount, tax) do not invalidate localization and cause no AI calls", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    // Commercial update only: change quantity and price
    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [
        {
          id: "line-1",
          position: 1,
          type: "PRODUCT",
          itemName: "Hikvision Camera",
          quantity: 10, // Commercial change
          unitPrice: 60, // Commercial change
        },
        {
          id: "line-2",
          position: 2,
          type: "SERVICE",
          itemName: "Installation",
          quantity: 2,
          unitPrice: 120,
        },
      ],
    });

    const updated = await repository.findById("company-1", "quotation-1");

    // All localized fields must be preserved
    expect(updated!.lines[0].itemNameAr).toBe("كاميرا هيكفيجن");
    expect(updated!.lines[0].itemNameEn).toBe("Hikvision Camera");
    expect(updated!.lines[0].descriptionEn).toBe("8 Megapixel Camera");
    expect(updated!.lines[1].itemNameEn).toBe("Installation and Programming");

    vi.mocked(mockTranslationPort.translateMany).mockClear();

    const snapshot = {
      lines: updated!.lines.map((l) => ({
        itemNameAr: l.itemNameAr,
        itemNameEn: l.itemNameEn,
        descriptionAr: l.descriptionAr,
        descriptionEn: l.descriptionEn,
      })),
    };

    await localizeQuotationDraft(snapshot);
    expect(mockTranslationPort.translateMany).not.toHaveBeenCalled();
  });

  it("7. A new line without ID does NOT inherit localized targets from an old line at the same position", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    // Send a genuinely new line without ID occupying position 1
    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [
        {
          position: 1, // Occupies position 1 (where old line-1 was), but has NO ID
          type: "PRODUCT",
          itemName: "Brand New Device",
          itemNameAr: "جهاز جديد كلياً",
          quantity: 1,
          unitPrice: 200,
        },
      ],
    });

    const updated = await repository.findById("company-1", "quotation-1");
    const newLine = updated!.lines[0];
    expect(newLine.itemNameAr).toBe("جهاز جديد كلياً");
    expect(newLine.itemNameEn ?? null).toBeNull(); // Must NOT inherit "Hikvision Camera" from old line-1!
  });

  it("8. An unknown/new ID is treated as a new line and does not fall back to position", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    // Send a line with a brand new ID "new-line-999" at position 1
    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [
        {
          id: "new-line-999", // Unknown/new ID
          position: 1, // Position 1
          type: "PRODUCT",
          itemName: "Switch Device",
          itemNameAr: "مفتاح شبكة",
          quantity: 1,
          unitPrice: 150,
        },
      ],
    });

    const updated = await repository.findById("company-1", "quotation-1");
    const newLine = updated!.lines[0];
    expect(newLine.itemNameAr).toBe("مفتاح شبكة");
    expect(newLine.itemNameEn ?? null).toBeNull(); // Must NOT inherit "Hikvision Camera" from old line-1!
  });

  it("9. Reordering existing lines with stable IDs preserves localized values for each ID", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    // Swap positions of line-1 and line-2 while retaining their stable IDs
    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [
        {
          id: "line-2", // Was position 2, now position 1
          position: 1,
          type: "SERVICE",
          itemName: "Installation",
          quantity: 1,
          unitPrice: 100,
        },
        {
          id: "line-1", // Was position 1, now position 2
          position: 2,
          type: "PRODUCT",
          itemName: "Hikvision Camera",
          quantity: 2,
          unitPrice: 50,
        },
      ],
    });

    const updated = await repository.findById("company-1", "quotation-1");

    // Line with ID "line-2" (now position 1) must retain its own localization
    const pos1Line = updated!.lines.find((l) => l.id === "line-2")!;
    expect(pos1Line.itemNameAr).toBe("تركيب وبرمجة");
    expect(pos1Line.itemNameEn).toBe("Installation and Programming");

    // Line with ID "line-1" (now position 2) must retain its own localization
    const pos2Line = updated!.lines.find((l) => l.id === "line-1")!;
    expect(pos2Line.itemNameAr).toBe("كاميرا هيكفيجن");
    expect(pos2Line.itemNameEn).toBe("Hikvision Camera");
  });

  it("10. When both locales are explicitly provided in the update, preserve both explicit values without invalidation", async () => {
    const initialQuotation = createSampleQuotation();
    const repository = createRepository(initialQuotation);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    // Provide BOTH subjectAr and subjectEn, and BOTH line itemNameAr and itemNameEn
    await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      subjectAr: "عرض أسعار معدل يدوياً", // Both provided
      subjectEn: "Manually Custom Proposal", // Both provided
      lines: [
        {
          id: "line-1",
          position: 1,
          type: "PRODUCT",
          itemName: "Custom Camera",
          itemNameAr: "كاميرا مخصصة", // Both provided
          itemNameEn: "Custom Camera", // Both provided
          quantity: 2,
          unitPrice: 50,
        },
      ],
    });

    const updated = await repository.findById("company-1", "quotation-1");

    // Both explicit values must be preserved
    expect(updated!.subjectAr).toBe("عرض أسعار معدل يدوياً");
    expect(updated!.subjectEn).toBe("Manually Custom Proposal");

    expect(updated!.lines[0].itemNameAr).toBe("كاميرا مخصصة");
    expect(updated!.lines[0].itemNameEn).toBe("Custom Camera");
  });
});
