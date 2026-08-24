import type { SystemCalculationResult } from "../../../domain/smart-system";
import {
  SystemTemplateRegistry,
  GypsumBoardSystemTemplate,
  CctvSystemTemplate,
  AccessControlSystemTemplate,
} from "../../../domain/smart-system";

export interface SystemDetectionMatch {
  systemType: string;
  confidence: number;
  extractedParameters: Record<string, any>;
}

export class SmartSystemBuilderService {
  private readonly registry: SystemTemplateRegistry;

  constructor() {
    this.registry = new SystemTemplateRegistry([
      new GypsumBoardSystemTemplate(),
      new CctvSystemTemplate(),
      new AccessControlSystemTemplate(),
    ]);
  }

  public detectSystemIntent(prompt: string): SystemDetectionMatch | null {
    const lower = prompt.toLowerCase();

    // 1. Gypsum Board detection
    const hasGypsumKeyword = lower.includes("gypsum") ||
      lower.includes("drywall") ||
      prompt.includes("جبس") ||
      prompt.includes("جبسوم") ||
      prompt.includes("جبسين") ||
      prompt.includes("جبسبورد");
    const areaMatch =
      prompt.match(/(-?\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|meter|meters|متر|م²|م٢)/i) ||
      prompt.match(/(?:مساحة|area)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
    const explicitGypsumSystem = /\b(?:gypsum|drywall)\s+system\b/i.test(prompt) ||
      /(?:سيستم|نظام)\s+(?:جبس|جبسوم|جبسين|جبسبورد)/.test(prompt);
    if (hasGypsumKeyword && (areaMatch || explicitGypsumSystem)) {

      const layersMatch = prompt.match(/(\d+)\s*(?:layers?|طبقات?|طبقة)/i);
      const wasteMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|هالك|هدر)/i);

      return {
        systemType: "GYPSUM_BOARD",
        confidence: 0.95,
        extractedParameters: {
          areaM2: areaMatch ? Number(areaMatch[1]) : null,
          layersCount: layersMatch ? Number(layersMatch[1]) : null,
          wastePercentage: wasteMatch ? Number(wasteMatch[1]) : null,
          includeInsulation:
            lower.includes("insulation") ||
            prompt.includes("عازل") ||
            prompt.includes("صوف صخري"),
          includeInstallation: this.requestsInstallation(prompt),
        },
      };
    }

    // 2. CCTV System detection. A generic product mention such as "4K Camera"
    // remains on the normal quotation path unless it carries a count or explicit
    // system intent.
    const cameraMatch =
      prompt.match(/(\d+)\s*(?:cameras?|cctv|كاميرات?|كاميرا)/i) ||
      prompt.match(/(?:سيستم|system)\s*(\d+)\s*كاميرا/i) ||
      prompt.match(/(\d+)-(?:camera|كاميرا)/i);
    const explicitCctvSystem = lower.includes("cctv") ||
      /\b(?:camera|surveillance)\s+system\b/i.test(prompt) ||
      /(?:سيستم|نظام)\s+(?:مراقبة|كاميرات?)/.test(prompt);
    if (explicitCctvSystem || (cameraMatch && this.requestsInstallation(prompt))) {

      let projectContext: string | null = null;
      if (
        lower.includes("commercial") ||
        lower.includes("office") ||
        prompt.includes("شركة") ||
        prompt.includes("تجاري") ||
        prompt.includes("مكتب")
      ) {
        projectContext = "commercial";
      } else if (
        lower.includes("warehouse") ||
        prompt.includes("مستودع") ||
        prompt.includes("مخزن")
      ) {
        projectContext = "warehouse";
      } else if (
        lower.includes("villa") ||
        prompt.includes("فيلا") ||
        prompt.includes("منزل")
      ) {
        projectContext = "villa";
      }

      return {
        systemType: "CCTV",
        confidence: 0.95,
        extractedParameters: {
          cameraCount: cameraMatch ? Number(cameraMatch[1]) : null,
          projectContext,
          includeInstallation: this.requestsInstallation(prompt),
        },
      };
    }

    const hasAccessControl = /\baccess\s*control\b/i.test(prompt) || /(?:تحكم|التحكم)\s+(?:في\s+)?الدخول/.test(prompt) || /اكسس\s*كنترول/.test(prompt);
    if (hasAccessControl) {
      const doorMatch = prompt.match(/(-?\d+)\s*(?:doors?|أبواب|ابواب|باب)/i);
      const entryExit = /entry\s*(?:and|&)\s*exit|دخول\s*و\s*خروج|قارئ(?:ين)?\s+(?:لل)?جهتين/.test(lower);
      const entryOnly = /entry\s*only|دخول\s*فقط|قارئ\s*واحد/.test(lower);
      const cableMatch = prompt.match(/(-?\d+(?:\.\d+)?)\s*(?:m|meter|meters|متر)\s*(?:per|لكل)\s*(?:door|باب)/i);
      return { systemType: "ACCESS_CONTROL", confidence: 0.95, extractedParameters: { doorCount: doorMatch ? Number(doorMatch[1]) : null, accessDirection: entryExit ? "ENTRY_EXIT" : entryOnly ? "ENTRY_ONLY" : null, includeInstallation: this.requestsInstallation(prompt), cableMetersPerDoor: cableMatch ? Number(cableMatch[1]) : null } };
    }

    return null;
  }

  public calculateSystem(
    systemType: string,
    inputs: Record<string, any>,
  ): SystemCalculationResult | null {
    const template = this.registry.get(systemType);
    if (!template) return null;
    return template.calculate(inputs);
  }

  private requestsInstallation(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return lower.includes("installation") || lower.includes("install") || prompt.includes("تركيب");
  }
}
