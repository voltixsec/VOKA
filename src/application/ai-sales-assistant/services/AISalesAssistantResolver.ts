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
} from "../dto/AISalesAssistantDto";
import {
  SALES_ASSISTANT_MAX_CANDIDATES,
} from "../dto/AISalesAssistantDto";
import type { AISalesAssistantPricingPort } from "../ports/AISalesAssistantPricingPort";
import { cleanCustomerEntity } from "./customer-entity";

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
          selection?.catalog?.[line.componentKey ?? line.text] ? { ...line, text: selection.catalog[line.componentKey ?? line.text].name } : line,
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

    const subject = intent.subject ?? (sourceLocale === "ar" ? "عرض تجاري — " : "Commercial proposal — ") + (intent.lines[0]?.text ?? "");
    const brief = intent.brief ?? intent.scopeOfWork ?? intent.lines.map((line) => `${line.quantity ?? "?"} × ${line.text}`).join("، ");
    const defaultPayment = customer.paymentTermDays != null ? (sourceLocale === "ar" ? `الدفع خلال ${customer.paymentTermDays} يوم` : `Payment within ${customer.paymentTermDays} days`) : null;
    const companyTerms = intent.scopeType ? await this.dependencies.terms?.find(companyId, intent.scopeType, sourceLocale) : null;
    // Do not concatenate potentially conflicting payment policies. Explicit/user and customer terms win.
    const terms = [intent.paymentTerms ?? defaultPayment ?? companyTerms, intent.warranty]
      .filter((value): value is string => Boolean(value))
      .join("\n") || null;
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
          missingInputs: intent.smartSystem.missingInputs,
          warnings: intent.smartSystem.warnings,
        }
      : null;

    return {
      documentType: intent.documentType,
      facts: intent.facts,
      completion: { subject: "AI_ESTIMATED", brief: "AI_ESTIMATED", currency: intent.currencyCode ? "USER_PROVIDED" : customer.preferredCurrency ? "CUSTOMER_DEFAULT" : "COMPANY_DEFAULT", terms: intent.paymentTerms ? "USER_PROVIDED" : defaultPayment ? "CUSTOMER_DEFAULT" : companyTerms ? "COMPANY_DEFAULT" : "NEEDS_CONFIRMATION", scope: intent.scopeType ? "USER_PROVIDED" : "NEEDS_CONFIRMATION" },
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
        attentionName: intent.attentionName ?? null,
        scopeType: intent.scopeType ?? null,
        currencyCode,
        priceListId,
      },
      lines: canonicalLines,
      financials,
      notes: intent.notes ?? null,
      notesAr: sourceLocale === "ar" ? intent.notes ?? null : null,
      notesEn: sourceLocale === "en" ? intent.notes ?? null : null,
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
    if (selected || exact.length === 1 || customers.length === 1) {
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

    const catalogItems = (
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
      reviewRequired: extracted.quantity == null,
      provenance: extracted.provenance,
      formulaExplanation: extracted.formulaExplanation,
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
      type,
      catalogItemId: null,
      catalogCandidates: candidates,
      itemName: extracted.text,
      itemNameAr: sourceLocale === "ar" ? extracted.text : null,
      itemNameEn: sourceLocale === "en" ? extracted.text : null,
      description: extracted.description ?? null,
      descriptionAr:
        sourceLocale === "ar" ? extracted.description ?? null : null,
      descriptionEn:
        sourceLocale === "en" ? extracted.description ?? null : null,
      quantity: extracted.quantity ?? null,
      requestedUnitText: requestedUnit,
      unitName: unit?.isActive ? unit.symbol : requestedUnit,
      unitNameAr: unit?.isActive ? unit.nameAr : null,
      unitNameEn: unit?.isActive ? unit.nameEn : null,
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
