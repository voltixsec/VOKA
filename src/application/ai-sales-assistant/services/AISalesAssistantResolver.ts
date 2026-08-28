import type { CatalogItemType } from "@/features/catalog/domain/entities/CatalogItem";
import type { CatalogItemRepository } from "@/features/catalog/domain/repositories/CatalogItemRepository";
import type { UnitRepository } from "@/features/catalog/domain/repositories/UnitRepository";
import type { CompanyRepository } from "@/features/company/domain/repositories/CompanyRepository";
import type { CustomerRepository } from "@/features/customers/domain/repositories/CustomerRepository";
import type { IQuotationReferenceValidator } from "../../quotation/repositories/IQuotationReferenceValidator";
import { QuotationCalculator } from "../../../domain/quotation";
import type {
  CatalogCandidateOption,
  CustomerCandidateOption,
  ExtractedLineItem,
  ExtractedSalesIntent,
  ResolvedCustomerCandidate,
  ResolvedLineItem,
  SalesAssistantDraftProposal,
  SalesAssistantSourceLocale,
  CommercialSelection,
  CommercialAnswerField,
} from "../dto/AISalesAssistantDto";
import {
  SALES_ASSISTANT_MAX_CANDIDATES,
} from "../dto/AISalesAssistantDto";
import type { AISalesAssistantPricingPort } from "../ports/AISalesAssistantPricingPort";
import { cleanCustomerEntity } from "./customer-entity";
import { customerMatchScore } from "@/features/customers/domain/customer-discovery";
import { companyToday, readCommercialClauses, resolveExpiry } from "./commercial-field-values";
import { customerLocaleText, professionalQuotationText } from "./quotation-customer-text";
import { cleanAttentionName } from "./attention-name";
import { hasCommercialCatalogPolicy, resolveCommercialCatalog } from "./commercial-catalog";

export interface AISalesAssistantResolverDependencies {
  terms?: { find(companyId: string, scopeType: NonNullable<ExtractedSalesIntent["scopeType"]>, locale: SalesAssistantSourceLocale): Promise<string | null> };
  companies: Pick<CompanyRepository, "findById">;
  customers: Pick<CustomerRepository, "findAll">;
  catalogItems: Pick<CatalogItemRepository, "findAll">;
  units: Pick<UnitRepository, "findById" | "findBySymbol">;
  quotationReferences: Pick<
    IQuotationReferenceValidator,
    "resolveTaxRatePercentages"
  >;
  pricing: AISalesAssistantPricingPort;
}

export class AISalesAssistantResolver {
  constructor(
    private readonly dependencies: AISalesAssistantResolverDependencies,
  ) {}

  async resolveProposal(
    companyId: string,
    intent: ExtractedSalesIntent,
    sourceLocale: SalesAssistantSourceLocale,
    extractionMode: "provider" | "heuristic",
    extractionWarnings: string[] = [],
    selection?: CommercialSelection,
    notApplicable: CommercialAnswerField[] = [],
    validityBaseDate?: string,
  ): Promise<SalesAssistantDraftProposal> {
    const company = await this.dependencies.companies.findById(companyId);
    if (!company) {
      throw new Error("ACTIVE_COMPANY_NOT_FOUND");
    }

    const customer = await this.resolveCustomer(
      companyId,
      selection?.customer?.name ?? intent.customerMention,
      intent.customerEmail,
      selection?.customer?.id,
    );
    const currencyCode =
      intent.currencyCode ?? customer.preferredCurrency ?? company.defaultCurrency;

    const priceListId =
      await this.dependencies.pricing.resolvePriceListId({
        companyId,
        customerId: customer.id ?? undefined,
        currencyCode,
      });

    const resolvedLines: ResolvedLineItem[] = [];
    for (const line of intent.lines) {
      resolvedLines.push(
        await this.resolveLineItem(
          companyId,
          !line.commercialRequirement && !line.commercializationPending && selection?.catalog?.[line.componentKey ?? line.text] ? { ...line, text: selection.catalog[line.componentKey ?? line.text].name } : line,
          sourceLocale,
          priceListId,
          currencyCode, company.defaultCurrency,
          selection?.catalog?.[line.componentKey ?? line.text]?.id,
        ),
      );
    }

    const taxRateIds = resolvedLines
      .map((line) => line.taxRateId)
      .filter((id): id is string => Boolean(id));
    const taxPercentages =
      await this.dependencies.quotationReferences.resolveTaxRatePercentages(
        companyId,
        taxRateIds,
        { activeOnly: true },
      );

    const warnings = [...extractionWarnings];
    const canonicalLines = resolvedLines.map((line, index) => {
      const taxPercentage =
        line.taxRateId
          ? taxPercentages.get(line.taxRateId)
          : undefined;
      const taxRateId =
        line.taxRateId && taxPercentage !== undefined
          ? line.taxRateId
          : null;

      if (line.taxRateId && !taxRateId) {
        warnings.push(
          `Line ${index + 1}: the catalog tax is inactive or unavailable and was not applied.`,
        );
      }

      if (line.quantity === null || line.unitPrice === null) {
        return {
          ...line,
          taxRateId,
          taxPercentage: taxPercentage ?? 0,
          subtotal: null,
          reviewRequired: true,
        };
      }

      const calculated = QuotationCalculator.calculateLine({
        position: index + 1,
        type: line.type,
        catalogItemId: line.catalogItemId,
        taxRateId,
        itemName: line.itemName,
        itemNameAr: line.itemNameAr,
        itemNameEn: line.itemNameEn,
        description: line.description,
        descriptionAr: line.descriptionAr,
        descriptionEn: line.descriptionEn,
        unitName: line.unitName,
        unitNameAr: line.unitNameAr,
        unitNameEn: line.unitNameEn,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxPercentage: taxPercentage ?? 0,
      });

      return {
        ...line,
        taxRateId,
        taxPercentage: calculated.taxPercentage ?? 0,
        subtotal: calculated.subtotal,
      };
    });

    const complete =
      canonicalLines.length > 0 &&
      canonicalLines.every(
        (line) => line.quantity !== null && line.unitPrice !== null,
      );

    const financials = complete
      ? QuotationCalculator.calculate(
          canonicalLines.map((line, index) => ({
            position: index + 1,
            type: line.type,
            catalogItemId: line.catalogItemId,
            taxRateId: line.taxRateId,
            itemName: line.itemName,
            itemNameAr: line.itemNameAr,
            itemNameEn: line.itemNameEn,
            description: line.description,
            descriptionAr: line.descriptionAr,
            descriptionEn: line.descriptionEn,
            unitName: line.unitName,
            unitNameAr: line.unitNameAr,
            unitNameEn: line.unitNameEn,
            quantity: line.quantity as number,
            unitPrice: line.unitPrice as number,
            taxPercentage: line.taxPercentage,
          })),
        ).totals
      : null;

    const { subject, brief } = professionalQuotationText(intent, canonicalLines, sourceLocale);
    const attentionName = cleanAttentionName(intent.attentionName);
    const defaultPayment = customer.paymentTermDays != null ? (sourceLocale === "ar" ? `الدفع خلال ${customer.paymentTermDays} يوم` : `Payment within ${customer.paymentTermDays} days`) : null;
    const companyTerms = intent.scopeType ? await this.dependencies.terms?.find(companyId, intent.scopeType, sourceLocale) : null;
    const today = validityBaseDate && resolveExpiry(validityBaseDate, "0000-01-01") ? validityBaseDate : companyToday(company.timezone);
    const localized = (value: string | null | undefined) => {
      const text = customerLocaleText(value, sourceLocale);
      if (value?.trim() && !text) warnings.push("Customer-facing content withheld: internal review text or untranslated prose requires human clarification.");
      return text;
    };
    const safeCompanyTerms = (companyTerms ?? '').split(/[\n;؛]+/).map(localized).filter(Boolean).join('\n');
    const defaults = readCommercialClauses(safeCompanyTerms, today);
    const userClauses = readCommercialClauses(intent.commercialSourceText, today);
    const userPayment = localized(intent.paymentTerms ?? userClauses.paymentTerms);
    const userDelivery = localized(intent.delivery ?? userClauses.delivery);
    const userWarranty = localized(intent.warranty ?? userClauses.warranty);
    const paymentTerms = intent.paymentTerms || userClauses.paymentTerms ? userPayment : defaultPayment ?? defaults.paymentTerms;
    const delivery = notApplicable.includes("delivery") ? null : intent.delivery || userClauses.delivery ? userDelivery : defaults.delivery;
    const warranty = notApplicable.includes("warranty") ? null : intent.warranty || userClauses.warranty ? userWarranty : defaults.warranty;
    const expiryDate = notApplicable.includes("expiryDate") ? null : (intent.expiryDate ? resolveExpiry(intent.expiryDate, today) : userClauses.expiryDate ?? defaults.expiryDate);
    const notes = localized(intent.notes);
    // Keep unrelated company clauses, replacing only labelled policies overridden
    // by explicit answers/customer defaults. Never concatenate conflicting policies.
    const otherTerms = safeCompanyTerms.split(/[\n;؛]+/).filter((part) => {
      const parsed = readCommercialClauses(part, today);
      return !Object.values(parsed).some(Boolean);
    });
    const labelled = (value: string | null, ar: string, en: string, label: RegExp) => value ? `${sourceLocale === "ar" ? ar : en}: ${value.replace(label, '').trim()}` : null;
    const terms = [...new Set([...otherTerms,
      labelled(paymentTerms, "شروط الدفع", "Payment", /^(?:شروط\s+الدفع|الدفع|payment(?:\s+terms)?)\s*:?\s*/i),
      labelled(delivery, "التسليم", "Delivery", /^(?:مدة\s+التسليم|التسليم|delivery)\s*:?\s*/i),
      labelled(warranty, "الضمان", "Warranty", /^(?:مدة\s+الضمان|الضمان|warranty)\s*:?\s*/i),
      expiryDate && `${sourceLocale === "ar" ? "صلاحية العرض" : "Quotation validity"}: ${expiryDate}`])]
      .filter(Boolean).join("\n") || null;
    const reviewRequired =
      customer.reviewRequired ||
      canonicalLines.length === 0 ||
      canonicalLines.some((line) => line.reviewRequired);

    const smartSystem = intent.smartSystem
      ? {
          systemType: intent.smartSystem.systemType,
          templateVersion: intent.smartSystem.templateVersion,
          systemNameAr: intent.smartSystem.systemNameAr,
          systemNameEn: intent.smartSystem.systemNameEn,
          status: intent.smartSystem.status,
          inputs: intent.smartSystem.inputs,
          requirements: intent.smartSystem.components,
          missingInputs: intent.smartSystem.missingInputs,
          warnings: intent.smartSystem.warnings,
        }
      : null;

    return {
      commercialTerms: { paymentTerms, delivery, warranty },
      fieldDefaults: { ...defaults, paymentTerms: defaultPayment ?? defaults.paymentTerms },
      fieldProvenance: {
        projectName: intent.projectName ? "USER_PROVIDED" : "NEEDS_CONFIRMATION",
        attentionName: attentionName ? "USER_PROVIDED" : "NEEDS_CONFIRMATION",
        expiryDate: !expiryDate ? "NEEDS_CONFIRMATION" : intent.expiryDate || userClauses.expiryDate ? "USER_PROVIDED" : "COMPANY_DEFAULT",
        paymentTerms: !paymentTerms ? "NEEDS_CONFIRMATION" : userPayment ? "USER_PROVIDED" : defaultPayment ? "CUSTOMER_DEFAULT" : "COMPANY_DEFAULT",
        delivery: !delivery ? "NEEDS_CONFIRMATION" : userDelivery ? "USER_PROVIDED" : "COMPANY_DEFAULT",
        warranty: !warranty ? "NEEDS_CONFIRMATION" : userWarranty ? "USER_PROVIDED" : "COMPANY_DEFAULT",
      },
      documentType: intent.documentType,
      facts: intent.facts,
      completion: { subject: "RULE_CALCULATED", brief: "RULE_CALCULATED", currency: intent.currencyCode ? "USER_PROVIDED" : customer.preferredCurrency ? "CUSTOMER_DEFAULT" : "COMPANY_DEFAULT", terms: userPayment || userDelivery || userWarranty ? "USER_PROVIDED" : defaultPayment ? "CUSTOMER_DEFAULT" : safeCompanyTerms ? "COMPANY_DEFAULT" : "NEEDS_CONFIRMATION", scope: intent.scopeType ? "USER_PROVIDED" : "NEEDS_CONFIRMATION" },
      estimateNotice: Boolean(smartSystem) || canonicalLines.some((line) => line.catalogItemId === null),
      customer,
      proposal: {
        subject,
        subjectAr: sourceLocale === "ar" ? subject || null : null,
        subjectEn: sourceLocale === "en" ? subject || null : null,
        brief,
        briefAr: sourceLocale === "ar" ? brief : null,
        briefEn: sourceLocale === "en" ? brief : null,
        projectName: intent.projectName ?? null,
        attentionName,
        expiryDate,
        validityBaseDate: today,
        scopeType: intent.scopeType ?? null,
        currencyCode,
        priceListId,
      },
      lines: canonicalLines,
      financials,
      notes,
      notesAr: sourceLocale === "ar" ? notes : null,
      notesEn: sourceLocale === "en" ? notes : null,
      termsAndConditions: terms,
      termsAndConditionsAr: sourceLocale === "ar" ? terms : null,
      termsAndConditionsEn: sourceLocale === "en" ? terms : null,
      reviewRequired: reviewRequired || Boolean(smartSystem && smartSystem.status !== "COMPLETE"),
      smartSystem,
      metadata: {
        region: customer.countryCode ?? (company.timezone === "Asia/Kuwait" ? "KW" : null),
        sourceLocale,
        extractionMode,
        confidenceSummary: reviewRequired
          ? "Review required before applying to the quotation composer."
          : "Deterministic customer and catalog matches resolved.",
        warnings,
      },
    };
  }

  private async resolveCustomer(
    companyId: string,
    mention?: string | null,
    email?: string | null,
    selectedId?: string,
  ): Promise<ResolvedCustomerCandidate> {
    const normalizedMention = cleanCustomerEntity(mention);
    const normalizedEmail = email?.trim() || null;
    const search = normalizedEmail ?? normalizedMention;

    if (!search) {
      return {
        status: "MISSING",
        id: null,
        mention: null,
        name: null,
        email: normalizedEmail,
        phone: null,
        candidates: [],
        reviewRequired: true,
      };
    }

    const [active, leads] = await Promise.all([
      this.dependencies.customers.findAll({
        companyId,
        search,
        status: "ACTIVE",
        take: SALES_ASSISTANT_MAX_CANDIDATES + 1,
      }),
      this.dependencies.customers.findAll({
        companyId,
        search,
        status: "LEAD",
        take: SALES_ASSISTANT_MAX_CANDIDATES + 1,
      }),
    ]);
    const customers = [...new Map(
      [...active, ...leads].map((customer) => [
        customer.id.toString(),
        customer,
      ]),
    ).values()];

    const exact = customers.filter((customer) => {
      const values = [
        customer.code,
        customer.name,
        customer.nameAr,
        customer.nameEn,
        customer.legalName,
        customer.email,
      ];
      return values.some(
        (value) =>
          typeof value === "string" &&
          this.normalize(value) === this.normalize(search),
      );
    });
    const candidates = customers
      .slice(0, SALES_ASSISTANT_MAX_CANDIDATES)
      .map<CustomerCandidateOption>((customer) => ({
        id: customer.id.toString(),
        code: customer.code,
        name: customer.name,
        email: customer.email,
        status: customer.status as "LEAD" | "ACTIVE",
      }));

    const selected = selectedId ? customers.find((candidate) => candidate.id.toString() === selectedId) : null;
    if (selectedId && !selected) throw new Error("CUSTOMER_SELECTION_INVALID");
    if (selected || (customers.length === 1 && customerMatchScore(customers[0], search) === 100)) {
      const customer = selected ?? exact[0] ?? customers[0];
      return {
        status: "MATCHED",
        id: customer.id.toString(),
        mention: normalizedMention,
        name: customer.name,
        email: customer.email ?? normalizedEmail,
        phone: customer.phone ?? customer.mobile,
        candidates: [],
        reviewRequired: false,
        preferredCurrency: customer.preferredCurrency,
        paymentTermDays: customer.paymentTermDays,
        countryCode: customer.countryCode,
      };
    }

    return {
      status: candidates.length > 0 ? "AMBIGUOUS" : "MISSING",
      id: null,
      mention: normalizedMention,
      name: normalizedMention,
      proposedCustomerName: candidates.length === 0 ? normalizedMention : null,
      email: normalizedEmail,
      phone: null,
      candidates,
      reviewRequired: true,
    };
  }

  private async resolveLineItem(
    companyId: string,
    extracted: ExtractedLineItem,
    sourceLocale: SalesAssistantSourceLocale,
    priceListId: string | null,
    currencyCode: string,
    companyCurrency: string,
    selectedId?: string,
  ): Promise<ResolvedLineItem> {
    const commercial = hasCommercialCatalogPolicy(extracted)
      ? await resolveCommercialCatalog(companyId, extracted, sourceLocale, this.dependencies.catalogItems, this.dependencies.units, selectedId)
      : null;
    if (commercial && !commercial.matched) {
      return this.unresolvedLine(companyId, { ...extracted,
        commercialRequirement: { ...extracted.commercialRequirement!, searchTruncated: commercial.searchTruncated,
          matchStatus: commercial.candidates.length ? "COMMERCIAL_MATCH_AMBIGUOUS" : "COMMERCIAL_ITEM_TEMPORARY" },
      }, sourceLocale, commercial.candidates.length ? "AMBIGUOUS" : "CUSTOM", commercial.candidates);
    }
    if (commercial?.matched) {
      extracted = commercial.matched.line;
      selectedId = commercial.matched.item.id.toString();
    }
    const search = extracted.text.trim();
    const intendedType: CatalogItemType | undefined =
      extracted.typeIntent === "PRODUCT" ||
      extracted.typeIntent === "SERVICE"
        ? extracted.typeIntent
        : undefined;

    if (extracted.typeIntent === "CUSTOM") {
      return this.unresolvedLine(
        companyId,
        extracted,
        sourceLocale,
        "CUSTOM",
        [],
      );
    }

    const catalogItems = commercial?.matched ? [commercial.matched.item] : (
      await this.dependencies.catalogItems.findAll({
        companyId,
        search,
        type: intendedType,
        isActive: true,
        take: SALES_ASSISTANT_MAX_CANDIDATES + 1,
      })
    ).filter((item) => item.isActive);

    const exact = catalogItems.filter((item) =>
      [
        item.code,
        item.name,
        item.nameAr,
        item.nameEn,
        item.sku,
        item.barcode,
      ].some(
        (value) =>
          value !== null &&
          this.normalize(value) === this.normalize(search),
      ),
    );
    const candidates = catalogItems
      .slice(0, SALES_ASSISTANT_MAX_CANDIDATES)
      .map<CatalogCandidateOption>((item) => ({
        id: item.id.toString(),
        code: item.code,
        name: item.name,
        type: item.type === "SERVICE" ? "SERVICE" : "PRODUCT",
      }));

    const selectedItem = selectedId ? catalogItems.find((candidate) => candidate.id.toString() === selectedId) : null;
    if (selectedId && !selectedItem) throw new Error("CATALOG_SELECTION_INVALID");
    if (!selectedItem && exact.length !== 1) {
      return this.unresolvedLine(
        companyId,
        extracted,
        sourceLocale,
        candidates.length > 0 ? "AMBIGUOUS" : "CUSTOM",
        candidates,
      );
    }

    const item = selectedItem ?? exact[0];
    const unit = item.unitId
      ? await this.dependencies.units.findById(item.unitId, companyId)
      : null;
    const priceInput = {
        companyId,
        priceListId,
        catalogItemId: item.id.toString(),
        quantity: extracted.quantity ?? 1,
    };
    const detail = this.dependencies.pricing.resolvePriceDetails ? await this.dependencies.pricing.resolvePriceDetails({ ...priceInput, currencyCode, companyCurrency }) : null;
    const unitPrice = detail ? detail.price : currencyCode === companyCurrency ? await this.dependencies.pricing.resolveUnitPrice(priceInput) : null;

    const itemType: "PRODUCT" | "SERVICE" | "CUSTOM" =
      item.type === "PRODUCT" || item.type === "SERVICE" ? item.type : "CUSTOM";

    return {
      resolutionStatus: "MATCHED",
      itemCode: item.code,
      commercialRequirement: extracted.commercialRequirement,
      commercializationPending: extracted.commercializationPending,
      type: itemType,
      catalogItemId: item.id.toString(),
      catalogCandidates: [],
      itemName: item.name,
      itemNameAr: item.nameAr,
      itemNameEn: item.nameEn,
      description: item.description,
      descriptionAr: item.descriptionAr,
      descriptionEn: item.descriptionEn,
      quantity: extracted.quantity ?? null,
      requestedUnitText: extracted.requestedUnitText ?? null,
      unitName: unit?.isActive ? unit.symbol : extracted.requestedUnitText ?? null,
      unitNameAr: unit?.isActive ? unit.nameAr : null,
      unitNameEn: unit?.isActive ? unit.nameEn : null,
      requestedPrice: extracted.requestedPrice ?? null,
      unitPrice,
      priceSource: unitPrice === null ? "NEEDS_CONFIRMATION" : "CATALOG_MATCHED",
      quantitySource: extracted.provenance === "CALCULATED" ? "RULE_CALCULATED" : extracted.provenance === "SUGGESTED" ? "AI_ESTIMATED" : "USER_PROVIDED",
      subtotal: null,
      taxRateId: item.taxRateId,
      taxPercentage: 0,
      reviewRequired: Boolean(extracted.commercialRequirement) || extracted.quantity == null,
      provenance: extracted.provenance,
      formulaExplanation: extracted.formulaExplanation,
      formulaExplanationAr: extracted.formulaExplanationAr,
      componentKey: extracted.componentKey,
    };
  }

  private async unresolvedLine(
    companyId: string,
    extracted: ExtractedLineItem,
    sourceLocale: SalesAssistantSourceLocale,
    status: "MISSING" | "AMBIGUOUS" | "CUSTOM",
    candidates: CatalogCandidateOption[],
  ): Promise<ResolvedLineItem> {
    const requestedUnit = extracted.requestedUnitText?.trim() || null;
    const unit = requestedUnit
      ? await this.dependencies.units.findBySymbol(companyId, requestedUnit)
      : null;
    const type =
      extracted.typeIntent === "PRODUCT" ||
      extracted.typeIntent === "SERVICE"
        ? extracted.typeIntent
        : "CUSTOM";

    return {
      resolutionStatus: status,
      itemCode: null,
      commercialRequirement: extracted.commercialRequirement,
      commercializationPending: extracted.commercializationPending,
      type,
      catalogItemId: null,
      catalogCandidates: candidates,
      itemName: extracted.text,
      itemNameAr: extracted.itemNameAr ?? (sourceLocale === "ar" ? extracted.text : null),
      itemNameEn: extracted.itemNameEn ?? (sourceLocale === "en" ? extracted.text : null),
      description: extracted.description ?? null,
      descriptionAr:
        sourceLocale === "ar" ? extracted.description ?? null : null,
      descriptionEn:
        sourceLocale === "en" ? extracted.description ?? null : null,
      quantity: extracted.quantity ?? null,
      requestedUnitText: requestedUnit,
      unitName: unit?.isActive ? unit.symbol : requestedUnit,
      unitNameAr: unit?.isActive ? unit.nameAr : extracted.commercializationPending ? "حزمة" : null,
      unitNameEn: unit?.isActive ? unit.nameEn : extracted.commercializationPending ? "Package" : null,
      requestedPrice: extracted.requestedPrice ?? null,
      unitPrice: extracted.requestedPrice ?? null,
      priceSource: extracted.requestedPrice != null ? "USER_PROVIDED" : "NEEDS_CONFIRMATION",
      quantitySource: extracted.provenance === "CALCULATED" ? "RULE_CALCULATED" : extracted.provenance === "SUGGESTED" ? "AI_ESTIMATED" : "USER_PROVIDED",
      subtotal: null,
      taxRateId: null,
      taxPercentage: 0,
      reviewRequired: true,
      provenance: extracted.provenance,
      formulaExplanation: extracted.formulaExplanation,
      formulaExplanationAr: extracted.formulaExplanationAr,
      componentKey: extracted.componentKey,
    };
  }

  private normalize(value: string): string {
    return value
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en")
      .replace(/[\s._,\-\/\\]+/g, " ");
  }
}
