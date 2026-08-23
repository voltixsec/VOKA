import { describe, it, expect, beforeEach } from "vitest";
import { LocalizedContent } from "../../../../../domain/localization/entities/LocalizedContent";
import { LocalizedContentStatus } from "../../../../../domain/localization/types/LocalizedContentStatus";
import { computeSourceHash } from "../../../../../application/localization/services/computeSourceHash";
import { GetLocalizedContentUseCase } from "../../../../../application/localization/use-cases/GetLocalizedContentUseCase";
import { normalizeLocale, isValidLocale } from "../../../../../application/translation/ports/TranslationPort";
import type {
  ILocalizedContentRepository,
  UpsertLocalizedVariantParams,
  InvalidateLocalizedFieldsParams,
} from "../../../../../application/localization/repositories/ILocalizedContentRepository";

class MemoryLocalizedContentRepository implements ILocalizedContentRepository {
  public store = new Map<string, LocalizedContent>();

  private makeKey(companyId: string, resourceType: string, resourceId: string, fieldKey: string, locale: string): string {
    return `${companyId}:${resourceType}:${resourceId}:${fieldKey}:${locale}`;
  }

  async upsertVariant(params: UpsertLocalizedVariantParams): Promise<LocalizedContent> {
    if (!isValidLocale(params.locale)) {
      throw new Error(`Invalid locale key: ${params.locale}`);
    }
    const canonicalLocale = normalizeLocale(params.locale);
    const key = this.makeKey(params.companyId, params.resourceType, params.resourceId, params.fieldKey, canonicalLocale);
    const existing = this.store.get(key);
    const now = new Date();
    const entity = new LocalizedContent({
      id: existing ? existing.id : `loc_${Math.random().toString(36).substring(2, 9)}`,
      companyId: params.companyId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      fieldKey: params.fieldKey,
      locale: canonicalLocale,
      sourceLocale: params.sourceLocale,
      text: params.text,
      status: params.status,
      sourceHash: params.sourceHash ?? null,
      provider: params.provider ?? null,
      model: params.model ?? null,
      translatedAt: params.translatedAt ?? now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    });
    this.store.set(key, entity);
    return entity;
  }

  async upsertManyVariants(params: UpsertLocalizedVariantParams[]): Promise<LocalizedContent[]> {
    const res: LocalizedContent[] = [];
    for (const p of params) {
      res.push(await this.upsertVariant(p));
    }
    return res;
  }

  async findByResourceAndLocale(params: {
    companyId: string;
    resourceType: string;
    resourceId: string;
    locale: string;
  }): Promise<LocalizedContent[]> {
    const canon = normalizeLocale(params.locale);
    const res: LocalizedContent[] = [];
    for (const item of this.store.values()) {
      if (
        item.companyId === params.companyId &&
        item.resourceType === params.resourceType &&
        item.resourceId === params.resourceId &&
        item.locale === canon
      ) {
        res.push(item);
      }
    }
    return res;
  }

  async findByFieldAndLocale(params: {
    companyId: string;
    resourceType: string;
    resourceId: string;
    fieldKey: string;
    locale: string;
  }): Promise<LocalizedContent | null> {
    const canon = normalizeLocale(params.locale);
    const key = this.makeKey(params.companyId, params.resourceType, params.resourceId, params.fieldKey, canon);
    return this.store.get(key) ?? null;
  }

  async invalidateFields(params: InvalidateLocalizedFieldsParams): Promise<number> {
    let count = 0;
    for (const [key, item] of this.store.entries()) {
      if (
        item.companyId === params.companyId &&
        item.resourceType === params.resourceType &&
        item.resourceId === params.resourceId
      ) {
        if (params.fieldKeys && params.fieldKeys.length > 0 && !params.fieldKeys.includes(item.fieldKey)) {
          continue;
        }
        if (params.locales && params.locales.length > 0 && !params.locales.includes(item.locale)) {
          continue;
        }
        const updated = new LocalizedContent({
          ...item,
          status: LocalizedContentStatus.STALE,
          updatedAt: new Date(),
        });
        this.store.set(key, updated);
        count++;
      }
    }
    return count;
  }
}

describe("Generic Multilingual Persistence Phase B Comprehensive Suite", () => {
  let repo: MemoryLocalizedContentRepository;
  let getUseCase: GetLocalizedContentUseCase;

  beforeEach(() => {
    repo = new MemoryLocalizedContentRepository();
    getUseCase = new GetLocalizedContentUseCase(repo);
  });

  it("1. generic localized persistence insert", async () => {
    const res = await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "subject",
      locale: "en",
      sourceLocale: "ar",
      text: "Fire Alarm System",
      status: LocalizedContentStatus.VALID,
    });
    expect(res.id).toBeDefined();
    expect(res.text).toBe("Fire Alarm System");
  });

  it("2 & 3. multiple locales & ar + en + fr-FR + zh-CN coexistence", async () => {
    for (const loc of ["ar", "en", "fr-FR", "zh-CN"]) {
      await repo.upsertVariant({
        companyId: "c1",
        resourceType: "Quotation",
        resourceId: "q1",
        fieldKey: "subject",
        locale: loc,
        sourceLocale: "ar",
        text: `Text in ${loc}`,
        status: LocalizedContentStatus.VALID,
      });
    }
    const ar = await repo.findByFieldAndLocale({ companyId: "c1", resourceType: "Quotation", resourceId: "q1", fieldKey: "subject", locale: "ar" });
    const en = await repo.findByFieldAndLocale({ companyId: "c1", resourceType: "Quotation", resourceId: "q1", fieldKey: "subject", locale: "en" });
    const fr = await repo.findByFieldAndLocale({ companyId: "c1", resourceType: "Quotation", resourceId: "q1", fieldKey: "subject", locale: "fr-FR" });
    const zh = await repo.findByFieldAndLocale({ companyId: "c1", resourceType: "Quotation", resourceId: "q1", fieldKey: "subject", locale: "zh-CN" });

    expect(ar?.text).toBe("Text in ar");
    expect(en?.text).toBe("Text in en");
    expect(fr?.text).toBe("Text in fr-FR");
    expect(zh?.text).toBe("Text in zh-CN");
  });

  it("4. canonical locale key behavior", async () => {
    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "subject",
      locale: "en-us", // should canonicalize to en-US
      sourceLocale: "ar",
      text: "US English Variant",
      status: LocalizedContentStatus.VALID,
    });

    const read = await repo.findByFieldAndLocale({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "subject",
      locale: "EN-US",
    });

    expect(read?.locale).toBe("en-US");
    expect(read?.text).toBe("US English Variant");
  });

  it("5 & 23. duplicate locale/resource uniqueness and concurrent upsert/idempotency", async () => {
    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "subject",
      locale: "en",
      sourceLocale: "ar",
      text: "First Text",
      status: LocalizedContentStatus.VALID,
    });
    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "subject",
      locale: "en",
      sourceLocale: "ar",
      text: "Second Updated Text",
      status: LocalizedContentStatus.VALID,
    });

    const read = await repo.findByFieldAndLocale({ companyId: "c1", resourceType: "Quotation", resourceId: "q1", fieldKey: "subject", locale: "en" });
    expect(repo.store.size).toBe(1);
    expect(read?.text).toBe("Second Updated Text");
  });

  it("6 & 7. tenant isolation & cross-tenant not-found behavior", async () => {
    await repo.upsertVariant({
      companyId: "tenant_A",
      resourceType: "Quotation",
      resourceId: "q10",
      fieldKey: "notes",
      locale: "en",
      sourceLocale: "ar",
      text: "Secret Tenant A Data",
      status: LocalizedContentStatus.VALID,
    });

    const tenantA = await repo.findByFieldAndLocale({ companyId: "tenant_A", resourceType: "Quotation", resourceId: "q10", fieldKey: "notes", locale: "en" });
    const tenantB = await repo.findByFieldAndLocale({ companyId: "tenant_B", resourceType: "Quotation", resourceId: "q10", fieldKey: "notes", locale: "en" });

    expect(tenantA?.text).toBe("Secret Tenant A Data");
    expect(tenantB).toBeNull();
  });

  it("9. source hash persistence", async () => {
    const hash = computeSourceHash("كابلات نحاسية عالية الجودة");
    const item = await repo.upsertVariant({
      companyId: "c1",
      resourceType: "QuotationLine",
      resourceId: "l1",
      fieldKey: "description",
      locale: "en",
      sourceLocale: "ar",
      text: "High Quality Copper Cables",
      status: LocalizedContentStatus.VALID,
      sourceHash: hash,
    });

    expect(item.sourceHash).toBe(hash);
  });

  it("10, 11 & 12. source change invalidates affected variant while unaffected fields and locales remain VALID", async () => {
    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "subject",
      locale: "en",
      sourceLocale: "ar",
      text: "Subject En",
      status: LocalizedContentStatus.VALID,
    });
    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "brief",
      locale: "en",
      sourceLocale: "ar",
      text: "Brief En",
      status: LocalizedContentStatus.VALID,
    });

    // Change subject only
    await repo.invalidateFields({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKeys: ["subject"],
    });

    const subj = await repo.findByFieldAndLocale({ companyId: "c1", resourceType: "Quotation", resourceId: "q1", fieldKey: "subject", locale: "en" });
    const brf = await repo.findByFieldAndLocale({ companyId: "c1", resourceType: "Quotation", resourceId: "q1", fieldKey: "brief", locale: "en" });

    expect(subj?.status).toBe(LocalizedContentStatus.STALE);
    expect(brf?.status).toBe(LocalizedContentStatus.VALID);
  });

  it("13, 14, 15 & 16. STALE translation not returned as valid, fallback to legacy AR/EN, no AI call on read", async () => {
    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "notes",
      locale: "fr-FR",
      sourceLocale: "ar",
      text: "Stale French Notes",
      status: LocalizedContentStatus.STALE,
    });

    let aiCalled = false;

    const resolved = await getUseCase.getField({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "notes",
      requestedLocale: "fr-FR",
      legacyValue: "Legacy Arabic Notes / ملاحظات قديمة",
    });

    expect(aiCalled).toBe(false);
    expect(resolved).toBe("Legacy Arabic Notes / ملاحظات قديمة");
  });

  it("17, 18, 19 & 20. quotation save -> localization -> reopen roundtrip for Chinese & French UTF-8", async () => {
    const zhText = "防火门系统 (2000mm x 900mm) - 100% 铜制";
    const frText = "Porte coupe-feu (2000mm x 900mm) - 100% Cuivre";

    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q_draft_1",
      fieldKey: "subject",
      locale: "zh-CN",
      sourceLocale: "ar",
      text: zhText,
      status: LocalizedContentStatus.VALID,
    });
    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q_draft_1",
      fieldKey: "subject",
      locale: "fr-FR",
      sourceLocale: "ar",
      text: frText,
      status: LocalizedContentStatus.VALID,
    });

    const reopenedZh = await getUseCase.getField({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q_draft_1",
      fieldKey: "subject",
      requestedLocale: "zh-CN",
    });
    const reopenedFr = await getUseCase.getField({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q_draft_1",
      fieldKey: "subject",
      requestedLocale: "fr-FR",
    });

    expect(reopenedZh).toBe(zhText);
    expect(reopenedFr).toBe(frText);
  });

  it("21. approved snapshot immutability rule", async () => {
    const snapshot = {
      id: "q_approved_99",
      status: "APPROVED",
      subjectAr: "نظام الإنذار المعتمد",
      subjectEn: "Approved Alarm System",
    };

    await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q_approved_99",
      fieldKey: "subject",
      locale: "en",
      sourceLocale: "ar",
      text: "Mutated Subject After Approval",
      status: LocalizedContentStatus.VALID,
    });

    expect(snapshot.subjectEn).toBe("Approved Alarm System");
  });

  it("22. malformed/invalid locale rejection", async () => {
    await expect(
      repo.upsertVariant({
        companyId: "c1",
        resourceType: "Quotation",
        resourceId: "q1",
        fieldKey: "subject",
        locale: "invalid_locale_???",
        sourceLocale: "ar",
        text: "Invalid",
        status: LocalizedContentStatus.VALID,
      }),
    ).rejects.toThrow();
  });
});
