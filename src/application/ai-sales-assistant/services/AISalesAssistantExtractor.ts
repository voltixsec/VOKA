import type { QuotationScopeType } from "../../../domain/quotation/types/QuotationScopeType";
import type {
  ExtractedIntentResult,
  ExtractedLineItem,
  ExtractedSalesIntent,
  SalesAssistantSourceLocale,
  SalesItemIntent,
} from "../dto/AISalesAssistantDto";
import { SALES_ASSISTANT_MAX_LINES } from "../dto/AISalesAssistantDto";
import { validateExtractedSalesIntent } from "../dto/validateExtractedSalesIntent";
import type { AISalesAssistantPort } from "../ports/AISalesAssistantPort";
import { SmartSystemBuilderService } from "../../smart-system/services/SmartSystemBuilderService";

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
  ): Promise<ExtractedIntentResult> {
    const trimmed = prompt.trim();
    const effectivePrompt = buildMode === "SUPPLY_INSTALL_SYSTEM" ? `${trimmed}\nSupply and installation system.` : trimmed;
    const allowSmartSystems = buildMode !== "CATALOG_ONLY";

    // Engineering-system intent is always resolved by server-owned rules. The
    // untrusted AI provider must never get authority over component quantities.
    if (allowSmartSystems && this.smartSystemBuilder.detectSystemIntent(effectivePrompt)) {
      const intent = this.heuristicExtract(effectivePrompt, sourceLocale, true);
      return {
        intent,
        extractionMode: "heuristic",
        warnings: [DETERMINISTIC_SYSTEM_WARNING, ...(intent.warnings ?? [])],
      };
    }

    if (this.provider) {
      try {
        const untrusted = await this.provider.extractIntent(
          trimmed,
          sourceLocale,
        );
        const intent = validateExtractedSalesIntent(untrusted);

        if (intent) {
          return {
            intent: {
              ...intent,
              sourceLocale,
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
  ): ExtractedSalesIntent {
    const systemMatch = allowSmartSystems ? this.smartSystemBuilder.detectSystemIntent(prompt) : null;

    if (systemMatch) {
      const calcResult = this.smartSystemBuilder.calculateSystem(
        systemMatch.systemType,
        systemMatch.extractedParameters,
      );

      if (calcResult) {
        const customerMention = this.extractCustomerMention(
          prompt,
          sourceLocale,
        );
        const customerEmail =
          prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ??
          null;

        const lines: ExtractedLineItem[] = calcResult.components.map((c) => ({
          text: sourceLocale === "ar" ? c.nameAr : c.nameEn,
          // Engineering audit detail remains separate from the commercial line
          // description and is not copied into the quotation composer.
          description: null,
          quantity: c.quantity,
          requestedUnitText: c.unit,
          requestedPrice: null, // AI & System templates do not invent prices
          typeIntent: c.itemType === "SERVICE" ? "SERVICE" : "PRODUCT",
          provenance: c.provenance,
          formulaExplanation: c.formulaExplanation,
          componentKey: c.componentKey,
        }));

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
      if (match && match.length <= 300) return match;
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
