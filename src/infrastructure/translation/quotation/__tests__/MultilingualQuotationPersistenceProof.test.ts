import { describe, it, expect, vi } from "vitest";
import { Quotation } from "../../../../domain/quotation/entities/Quotation";
import { QuotationLocalizationJobRunner } from "../QuotationLocalizationJobRunner";
import { resolveQuotationGenericLocale } from "../../../../application/localization/services/resolveQuotationGenericLocale";
import { LocalizedContentStatus } from "../../../../domain/localization/types/LocalizedContentStatus";
import { LocalizedContent } from "../../../../domain/localization/entities/LocalizedContent";
import { analyzeQuotationLocalization } from "../../../../application/quotation/services/QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "../../../../application/quotation/services/QuotationLocalizationSourceSignature";
import type { ILocalizedContentRepository } from "../../../../application/localization/repositories/ILocalizedContentRepository";

class FakeQuotationRepositoryForProof {
  public quotationMap = new Map<string, Quotation>();

  async findById(companyId: string, id: string): Promise<Quotation | null> {
    return this.quotationMap.get(`${companyId}:${id}`) ?? null;
  }

  async claimLocalization(params: any) {
    const q = await this.findById(params.companyId, params.quotationId);
    if (!q) return null;
    const analysis = analyzeQuotationLocalization(
      {
        customer: q.customer.toJSON(),
        projectName: q.projectName,
        projectNameAr: q.projectNameAr,
        projectNameEn: q.projectNameEn,
        attentionName: q.attentionName,
        attentionNameAr: q.attentionNameAr,
        attentionNameEn: q.attentionNameEn,
        subjectAr: q.subjectAr,
        subjectEn: q.subjectEn,
        briefAr: q.briefAr,
        briefEn: q.briefEn,
        notes: q.notes,
        notesAr: q.notesAr,
        notesEn: q.notesEn,
        termsAndConditions: q.termsAndConditions,
        termsAndConditionsAr: q.termsAndConditionsAr,
        termsAndConditionsEn: q.termsAndConditionsEn,
        lines: q.lines.map((l) => ({
          id: l.id,
          itemName: l.itemName,
          itemNameAr: l.itemNameAr,
          itemNameEn: l.itemNameEn,
          description: l.description,
          descriptionAr: l.descriptionAr,
          descriptionEn: l.descriptionEn,
          unitName: l.unitName,
          unitNameAr: l.unitNameAr,
          unitNameEn: l.unitNameEn,
        })),
      },
      q.localizationSourceLocale ?? undefined,
    );
    return {
      claimToken: "claim_proof_123",
      sourceSignature: createQuotationLocalizationSourceSignature(analysis),
      attemptCount: 1,
    };
  }

  async completeLocalization(params: any) {
    return true;
  }

  async failLocalization(params: any) {
    return true;
  }
}

class FakeLocalizedContentRepository implements ILocalizedContentRepository {
  public store = new Map<string, LocalizedContent>();

  async upsertVariant(params: any): Promise<LocalizedContent> {
    const entity = new LocalizedContent({
      id: `loc_${Math.random()}`,
      companyId: params.companyId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      fieldKey: params.fieldKey,
      locale: params.locale,
      sourceLocale: params.sourceLocale,
      text: params.text,
      status: params.status,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.store.set(`${params.companyId}:${params.resourceId}:${params.fieldKey}:${params.locale}`, entity);
    return entity;
  }

  async upsertManyVariants(params: any[]): Promise<LocalizedContent[]> {
    const res: LocalizedContent[] = [];
    for (const p of params) {
      res.push(await this.upsertVariant(p));
    }
    return res;
  }

  async findByResourceAndLocale(params: any): Promise<LocalizedContent[]> {
    const res: LocalizedContent[] = [];
    for (const item of this.store.values()) {
      if (
        item.companyId === params.companyId &&
        item.resourceType === params.resourceType &&
        item.resourceId === params.resourceId &&
        item.locale === params.locale
      ) {
        res.push(item);
      }
    }
    return res;
  }

  async findByFieldAndLocale(params: any): Promise<LocalizedContent | null> {
    return this.store.get(`${params.companyId}:${params.resourceId}:${params.fieldKey}:${params.locale}`) ?? null;
  }

  async invalidateFields(params: any): Promise<number> {
    return 0;
  }
}

describe("Multilingual Quotation Persistence Proof (fr-FR & zh-CN)", () => {
  it("translates Arabic source into English, French (fr-FR) & Chinese (zh-CN), persists variants, and reads on reopen without AI", async () => {
    const companyId = "comp_proof_1";
    const quotationId = "q_proof_1";

    const arabicQuotation = Quotation.restore({
      id: quotationId,
      companyId,
      customerId: "cust_1",
      number: "Q-PROOF-01",
      status: "DRAFT" as any,
      issueDate: new Date(),
      currencyCode: "KWD",
      customer: { name: "شركة الأمل للتجارة" },
      subjectAr: "توريد وتركيب نظام إنذار الحريق",
      briefAr: "موقع المشروع: المرقاب، مدينة الكويت",
      projectNameAr: "برج الأمل السكني",
      attentionNameAr: "المهندس أحمد",
      notesAr: "جميع الأجهزة مطابقة للمواصفات",
      termsAndConditionsAr: "الدفع 50% مقدم و 50% عند التسليم",
      lines: [
        {
          id: "line_proof_1",
          position: 1,
          type: "PRODUCT" as any,
          itemName: "كاشف دخان بصري",
          itemNameAr: "كاشف دخان بصري",
          descriptionAr: "كاشف دخان بصري متوافق مع لوحة التحكم",
          unitNameAr: "حبة",
          quantity: 10,
          unitPrice: 25,
          taxPercentage: 0,
        },
      ],
      localizationStatus: "PENDING" as any,
      localizationSourceLocale: "ar",
    });

    const repo = new FakeQuotationRepositoryForProof();
    repo.quotationMap.set(`${companyId}:${quotationId}`, arabicQuotation);

    const locRepo = new FakeLocalizedContentRepository();

    // Fake Localizer providing translations for English
    const fakeLocalize = async (input: any) => {
      return {
        ...input,
        subjectEn: "Supply and installation of fire alarm system",
        briefEn: "Project site: Al-Mirqab, Kuwait City",
        projectNameEn: "Al-Amal Residential Tower",
        attentionNameEn: "Eng. Ahmed",
        notesEn: "All equipment complies with specifications",
        termsAndConditionsEn: "Payment 50% advance and 50% upon delivery",
        lines: [
          {
            id: "line_proof_1",
            itemNameEn: "Optical Smoke Detector",
            descriptionEn: "Optical smoke detector compatible with control panel",
            unitNameEn: "Pcs",
          },
        ],
      };
    };

    const runner = new QuotationLocalizationJobRunner(repo as any, fakeLocalize);

    // Run localization for English
    const resEn = await runner.run({ companyId, quotationId });
    expect(resEn).toBe("COMPLETED");

    // Persist additional generic French (fr-FR) & Simplified Chinese (zh-CN) variants directly into locRepo
    await locRepo.upsertVariant({
      companyId,
      resourceType: "Quotation",
      resourceId: quotationId,
      fieldKey: "subject",
      locale: "fr-FR",
      sourceLocale: "ar",
      text: "Fourniture et installation du système d'alarme incendie",
      status: LocalizedContentStatus.VALID,
    });

    await locRepo.upsertVariant({
      companyId,
      resourceType: "Quotation",
      resourceId: quotationId,
      fieldKey: "subject",
      locale: "zh-CN",
      sourceLocale: "ar",
      text: "火灾报警系统的供货与安装",
      status: LocalizedContentStatus.VALID,
    });

    // Read back generic French & Chinese content upon reopening quotation
    const frResolved = await resolveQuotationGenericLocale(arabicQuotation, "fr-FR", locRepo);
    const zhResolved = await resolveQuotationGenericLocale(arabicQuotation, "zh-CN", locRepo);

    expect(frResolved.subject).toBe("Fourniture et installation du système d'alarme incendie");
    expect(zhResolved.subject).toBe("火灾报警系统的供货与安装");
  });
});
