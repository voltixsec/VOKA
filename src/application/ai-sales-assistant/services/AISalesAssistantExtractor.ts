import type { QuotationScopeType } from "../../../domain/quotation/types/QuotationScopeType";
import type {
  ExtractedIntentResult,
  ExtractedLineItem,
  ExtractedSalesIntent,
  SalesAssistantSourceLocale,
  SalesItemIntent,
  CommercialAnswers,
  SystemFieldAnswers,
} from "../dto/AISalesAssistantDto";
import { SALES_ASSISTANT_MAX_LINES } from "../dto/AISalesAssistantDto";
import { validateExtractedSalesIntent } from "../dto/validateExtractedSalesIntent";
import type { AISalesAssistantPort } from "../ports/AISalesAssistantPort";
import { SmartSystemBuilderService } from "../../smart-system/services/SmartSystemBuilderService";
import { cleanCustomerEntity, extractArabicRelationalEntities, extractEnglishRelationalEntities, fallbackCompanyEntity } from "./customer-entity";
import { commercializeSystemComponent } from "./commercialize-system-component";

const FALLBACK_WARNING =
  "Structured AI extraction was unavailable or invalid; conservative heuristic extraction was used.";
const DETERMINISTIC_SYSTEM_WARNING =
  "Smart System quantities were derived exclusively by the server-owned deterministic template; AI output was not used for engineering quantities.";

export class AISalesAssistantExtractor {
  private readonly smartSystemBuilder = new SmartSystemBuilderService();

  constructor(
    private readonly provider?: AISalesAssistantPort | null,
  ) {}

  async extractIntent(
    prompt: string,
    sourceLocale: SalesAssistantSourceLocale,
    buildMode: "AUTO" | "CATALOG_ONLY" | "SUPPLY_INSTALL_SYSTEM" = "AUTO",
    answers: CommercialAnswers = {},
    systemAnswers: SystemFieldAnswers = {},
    preinterpretedIntent?: unknown,
  ): Promise<ExtractedIntentResult> {
    const trimmed = prompt.trim();
    let understood: ExtractedSalesIntent | null = validateExtractedSalesIntent(preinterpretedIntent);
    if (!understood && this.provider) {
      try { understood = validateExtractedSalesIntent(await this.provider.extractIntent(trimmed, sourceLocale)); } catch { /* deterministic fallback */ }
    }
    let customerMention = cleanCustomerEntity(understood?.customerMention);
    const fallbackCustomer = this.extractCustomerMention(trimmed, sourceLocale);
    if (!customerMention && this.provider?.extractCustomerMention && (understood?.customerMention || fallbackCustomer)) {
      try {
        const repaired = await this.provider.extractCustomerMention(trimmed, sourceLocale);
        if (repaired && typeof repaired === "object") customerMention = cleanCustomerEntity((repaired as { customerMention?: unknown }).customerMention);
      } catch { /* Keep commercial intelligence usable if focused extraction fails. */ }
    }
    customerMention ??= fallbackCustomer;
    const relationalEntities = sourceLocale === "ar" ? extractArabicRelationalEntities(trimmed) : extractEnglishRelationalEntities(trimmed);
    // Evidence must occur in the user's context; provider assertions alone are not user facts.
    const facts = (understood?.facts ?? []).filter((fact) => trimmed.includes(fact.evidence)).map((fact) => ({ ...fact, provenance: "USER_PROVIDED" as const }));
    for (const [name, pattern] of [
      ["cameraCount", /(\d+)\s*(?:cameras?|كاميرات|كاميرا)/i],
      ["areaM2", /(\d+(?:\.\d+)?)\s*(?:sqm|m2|متر)/i],
      ["projectContext", /(factory|مصنع|villa|فيلا|warehouse|مستودع)/i],
      ["coverage", /(full coverage|التغطية كاملة)/i],
    ] as const) {
      const match = trimmed.match(pattern);
      if (match && !facts.some((fact) => fact.name === name)) facts.push({ name, value: match[1], evidence: match[0], provenance: "USER_PROVIDED" });
    }
    const cameraFact = facts.find((fact) => fact.name === "cameraCount" && /^\d+$/.test(fact.value) && fact.evidence.includes(fact.value));
    const evidencePrompt = cameraFact ? `${trimmed}\n${cameraFact.value} cameras` : trimmed;
    const effectivePrompt = buildMode === "SUPPLY_INSTALL_SYSTEM" ? `${evidencePrompt}\nSupply and installation system.` : evidencePrompt;
    const allowSmartSystems = buildMode !== "CATALOG_ONLY";

    // Engineering-system intent is always resolved by server-owned rules. The
    // untrusted AI provider must never get authority over component quantities.
    const detectedSystem = allowSmartSystems ? this.smartSystemBuilder.detectSystemIntent(effectivePrompt) : null;
    if (detectedSystem) {
      // The existing template declares valid input names and validates their
      // values. Conversation state cannot introduce engineering parameters.
      const declaredInputs = new Set(this.smartSystemBuilder.calculateSystem(detectedSystem.systemType, detectedSystem.extractedParameters)?.inputs.map((input) => input.name));
      const targetedInputs = Object.fromEntries(Object.entries(systemAnswers).filter(([key, value]) => declaredInputs.has(key) && ["string", "number", "boolean"].includes(typeof value)));
      const parameters = { ...(cameraFact ? { cameraCount: Number(cameraFact.value) } : {}), ...targetedInputs, ...Object.fromEntries(Object.entries(answers).filter(([key]) => ["cameraCount", "storageDays", "bitrateMbps", "cableMetersPerCamera"].includes(key)).map(([key, value]) => [key, Number(value)])) };
      const deterministic = this.heuristicExtract(effectivePrompt, sourceLocale, true, parameters);
      const intent = { ...understood, ...deterministic, customerMention, subject: understood?.subject ?? deterministic.subject, brief: understood?.brief ?? trimmed, paymentTerms: understood?.paymentTerms, warranty: understood?.warranty, projectName: relationalEntities.projectName ?? understood?.projectName, attentionName: relationalEntities.attentionName ?? understood?.attentionName, documentType: understood?.documentType, facts };
      return {
        intent,
        extractionMode: understood ? "provider" : "heuristic",
        warnings: [DETERMINISTIC_SYSTEM_WARNING, ...(intent.warnings ?? [])],
      };
    }

    if (understood) {
      try {
        const intent = understood;

        if (intent) {
          return {
            intent: {
              ...intent,
              sourceLocale, facts, customerMention,
              projectName: relationalEntities.projectName ?? intent.projectName,
              attentionName: relationalEntities.attentionName ?? intent.attentionName,
            },
            extractionMode: "provider",
            warnings: intent.warnings ?? [],
          };
        }
      } catch {
        // Provider failures are intentionally reduced to a safe fallback signal.
      }
    }

    const intent = this.heuristicExtract(trimmed, sourceLocale, allowSmartSystems);
    intent.facts = facts;
    intent.customerMention = customerMention;
    intent.projectName = relationalEntities.projectName;
    intent.attentionName = relationalEntities.attentionName;
    return {
      intent,
      extractionMode: "heuristic",
      warnings: [FALLBACK_WARNING, ...(intent.warnings ?? [])],
    };
  }

  public heuristicExtract(
    prompt: string,
    sourceLocale: SalesAssistantSourceLocale,
    allowSmartSystems = true,
    parameters: SystemFieldAnswers = {},
  ): ExtractedSalesIntent {
    const systemMatch = allowSmartSystems ? this.smartSystemBuilder.detectSystemIntent(prompt) : null;

    if (systemMatch) {
      const calcResult = this.smartSystemBuilder.calculateSystem(
        systemMatch.systemType,
        { ...systemMatch.extractedParameters, ...parameters },
      );

      if (calcResult) {
        const customerMention = this.extractCustomerMention(
          prompt,
          sourceLocale,
        );
        const customerEmail =
          prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ??
          null;

        const lines = calcResult.components.map((component) => commercializeSystemComponent(component, sourceLocale, calcResult));

        const systemWarnings = [
          sourceLocale === "ar"
            ? `تم احتساب البنود والكميات تلقائياً عبر محرّك النظام المحدد: ${calcResult.systemNameAr}`
            : `System derived using deterministic template: ${calcResult.systemNameEn}`,
          ...calcResult.warnings,
        ];

        // Preserve requested price if present in prompt
        const priceMatch = prompt.match(/(?:\u0628\u0633\u0639\u0631|\u0633\u0639\u0631|\bat\b|\bprice\b)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
        if (priceMatch) {
          const reqPrice = Number(priceMatch[1]);
          for (const l of lines) {
            if (l.typeIntent === "PRODUCT" && l.componentKey?.includes("CAMERA")) {
              l.requestedPrice = reqPrice;
            }
          }
        }

        return {
          sourceLocale,
          customerMention,
          customerEmail,
          subject: customerMention
            ? sourceLocale === "ar"
              ? `عرض سعر - ${calcResult.systemNameAr} - ${customerMention}`
              : `Quotation - ${calcResult.systemNameEn} - ${customerMention}`
            : sourceLocale === "ar"
            ? `عرض سعر - ${calcResult.systemNameAr}`
            : `Quotation - ${calcResult.systemNameEn}`,
          scopeType: this.extractScopeType(prompt),
          currencyCode: this.extractCurrency(prompt),
          lines,
          notes: sourceLocale === "ar" ? calcResult.systemNameAr : calcResult.systemNameEn,
          warnings: systemWarnings,
          smartSystem: calcResult,
        };
      }
    }

    const customerMention = this.extractCustomerMention(
      prompt,
      sourceLocale,
    );
    const customerEmail =
      prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ??
      null;

    return {
      sourceLocale,
      customerMention,
      customerEmail,
      subject: customerMention
        ? sourceLocale === "ar"
          ? `\u0639\u0631\u0636 \u0633\u0639\u0631 - ${customerMention}`
          : `Quotation - ${customerMention}`
        : null,
      scopeType: this.extractScopeType(prompt),
      currencyCode: this.extractCurrency(prompt),
      lines: this.extractLines(prompt, customerMention, sourceLocale),
      warnings: [
        sourceLocale === "ar"
          ? "Review all extracted Arabic commercial details before applying."
          : "Review all extracted commercial details before applying.",
      ],
    };
  }

  private extractCustomerMention(
    prompt: string,
    sourceLocale: SalesAssistantSourceLocale,
  ): string | null {
    const companyEntity = fallbackCompanyEntity(prompt);
    if (companyEntity) return companyEntity;
    const patterns =
      sourceLocale === "ar"
        ? [
            /(?:\u0639\u0631\u0636\s+\u0633\u0639\u0631\s+(?:\u0644|\u0644\u0639\u0645\u064a\u0644|\u0644\u0634\u0631\u0643\u0629)|\u0644\u0634\u0631\u0643\u0629|\u0627\u0644\u0639\u0645\u064a\u0644)\s+(.+?)(?=\s+(?:\d+(?:\.\d+)?|\u062a\u0648\u0631\u064a\u062f|\u062a\u0631\u0643\u064a\u0628|\u062e\u062f\u0645\u0629|\u0635\u064a\u0627\u0646\u0629)|[,;:\n]|$)/i,
          ]
        : [
            /(?:quotation|quote)\s+for\s+(.+?)(?=\s+(?:supply|installation|service|maintenance|\d+(?:\.\d+)?\s*(?:units?|pcs?|pieces?))|[,;:\n]|$)/i,
            /(?:customer|client)\s+(.+?)(?=\s+(?:needs?|requests?|\d+(?:\.\d+)?)|[,;:\n]|$)/i,
          ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern)?.[1]?.trim();
      const entity = cleanCustomerEntity(match);
      if (entity) return entity;
    }

    return null;
  }

  private extractScopeType(
    prompt: string,
  ): QuotationScopeType | null {
    const lower = prompt.toLowerCase();

    if (
      lower.includes("supply and installation") ||
      lower.includes("with installation") ||
      (prompt.includes("\u0648\u0631\u064a\u062f") && prompt.includes("\u0631\u0643\u064a\u0628")) ||
      prompt.includes("\u0645\u0639 \u0627\u0644\u062a\u0631\u0643\u064a\u0628") ||
      prompt.includes("\u0645\u0639 \u062a\u0631\u0643\u064a\u0628")
    ) {
      return "SUPPLY_AND_INSTALLATION";
    }
    if (
      lower.includes("supply only") ||
      prompt.includes("\u062a\u0648\u0631\u064a\u062f \u0641\u0642\u0637")
    ) {
      return "SUPPLY_ONLY";
    }
    if (
      lower.includes("installation only") ||
      prompt.includes("\u062a\u0631\u0631\u0643\u064a\u0628 \u0641\u0642\u0637")
    ) {
      return "INSTALLATION_ONLY";
    }
    if (
      lower.includes("maintenance") ||
      prompt.includes("\u0635\u064a\u0627\u0646\u0629")
    ) {
      return "MAINTENANCE";
    }
    if (
      lower.includes("consultation") ||
      prompt.includes("\u0627\u0633\u062a\u0634\u0627\u0631\u0629")
    ) {
      return "CONSULTATION";
    }
    if (
      lower.includes("service") ||
      prompt.includes("\u062e\u062f\u0645\u0629")
    ) {
      return "SERVICE";
    }
    if (
      lower.includes("installation") ||
      prompt.includes("\u0631\u0643\u064a\u0628")
    ) {
      return "INSTALLATION_ONLY";
    }
    if (
      lower.includes("supply") ||
      prompt.includes("\u0648\u0631\u064a\u062f")
    ) {
      return "SUPPLY_ONLY";
    }

    return null;
  }

  private extractCurrency(prompt: string): string | null {
    const match = prompt.match(/\b(KWD|USD|EUR|SAR|AED)\b/i);
    if (match) return match[1].toUpperCase();

    if (
      /\u062f\s*\.?\s*\u0643/.test(prompt) ||
      prompt.includes("\u062f\u064a\u0646\u0627\u0631 \u0643\u0648\u064a\u062a\u064a")
    ) {
      return "KWD";
    }

    return null;
  }

  private extractLines(
    prompt: string,
    customerMention: string | null,
    sourceLocale: SalesAssistantSourceLocale,
  ): ExtractedLineItem[] {
    const segments = prompt
      .split(/[\n;,\u060C]+/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .slice(0, SALES_ASSISTANT_MAX_LINES);

    const lines = segments.map((segment) =>
      this.extractLine(segment, customerMention, sourceLocale),
    );

    return lines.filter(
      (line): line is ExtractedLineItem => line !== null,
    );
  }

  private extractLine(
    segment: string,
    customerMention: string | null,
    sourceLocale: SalesAssistantSourceLocale,
  ): ExtractedLineItem | null {
    const quantityMatch =
      segment.match(
        /(\d+(?:\.\d+)?)\s*(units?|pcs?|pieces?|items?|\u0642\u0637\u0639\u0629|\u0642\u0637\u0639|\u062d\u0628\u0629|\u062d\u0628\u0627\u062a|\u062c\u0647\u0627\u0632|\u0623\u062c\u0647\u0632\u0629|\u0648\u062d\u0629|\u0648\u062d\u0627\u062a|\u0643\u0627\u0645\u064a\u0631\u0627\u062a|\u0643\u0627\u0645\u064a\u0631\u0627)?/i,
      ) ||
      segment.match(/(\d+(?:\.\d+)?)/);
    const priceMatch =
      segment.match(
        /(?:\bat\b|\bprice\b|\bcost\b|\u0628\u0633\u0639\u0631|\u0633\u0639\u0631|\u0628\u0645\u0628\u0644\u063a)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i,
      );

    let text = segment;
    if (customerMention) {
      text = text.replace(customerMention, " ");
    }
    text = text
      .replace(
        /^(?:please\s+)?(?:create|prepare|make)?\s*(?:a\s+)?(?:quotation|quote)\s*(?:for)?\s*/i,
        " ",
      )
      .replace(
        /(?:\u0627\u0639\u0645\u0644|\u0623\u0646\u0634\u0626|\u062c\u0647\u0632)?\s*\u0639\u0631\u0636\s+\u0633\u0639\u0631\s*(?:\u0644\u0634\u0631\u0643\u0629|\u0644\u0644\u0639\u0645\u064a\u0644)?\s*/i,
        " ",
      )
      .replace(
        /(?:\bat\b|\bprice\b|\bcost\b|\u0628\u0633\u0639\u0631|\u0633\u0639\u0631|\u0628\u0645\u0628\u0644\u063a)\s*[:=-]?\s*\d+(?:\.\d+)?\s*(?:KWD|USD|EUR|SAR|AED|\u062f\s*\.?\s*\u0643)?/gi,
        " ",
      )
      .replace(
        /^\s*\d+(?:\.\d+)?\s*(?:units?|pcs?|pieces?|items?|\u0642\u0637\u0639\u0629|\u0642\u0637\u0639|\u062d\u0628\u0629|\u062d\u0628\u0627\u062a|\u062c\u0647\u0627\u0632|\u0623\u062c\u0647\u0632\u0629|\u0648\u062d\u0629|\u0648\u062d\u0627\u062a)?\s*/i,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      text = segment.slice(0, 500).trim();
    }
    if (!text) return null;

    const lower = text.toLowerCase();
    let typeIntent: SalesItemIntent = "UNKNOWN";
    if (
      lower.includes("service") ||
      lower.includes("maintenance") ||
      lower.includes("installation") ||
      text.includes("\u062e\u062f\u0645\u0629") ||
      text.includes("\u0635\u064a\u0627\u0646\u0629") ||
      text.includes("\u062a\u0631\u0643\u064a\u0628")
    ) {
      typeIntent = "SERVICE";
    } else if (
      sourceLocale === "en" ||
      text.includes("\u062a\u0648\u0631\u064a\u062f")
    ) {
      typeIntent = "PRODUCT";
    }

    return {
      text: text.slice(0, 500),
      quantity: quantityMatch ? Number(quantityMatch[1]) : null,
      requestedUnitText: quantityMatch?.[2] ?? null,
      requestedPrice: priceMatch ? Number(priceMatch[1]) : null,
      typeIntent,
    };
  }
}
