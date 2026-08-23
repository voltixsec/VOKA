import type { SystemCalculationResult } from "../../../domain/smart-system";
import {
  globalSystemTemplateRegistry,
  GypsumBoardSystemTemplate,
  CctvSystemTemplate,
} from "../../../domain/smart-system";

export interface SystemDetectionMatch {
  systemType: string;
  confidence: number;
  extractedParameters: Record<string, any>;
}

export class SmartSystemBuilderService {
  constructor() {
    // Ensure default templates are registered
    const registry = globalSystemTemplateRegistry;
    if (!registry.has("GYPSUM_BOARD")) {
      registry.register(new GypsumBoardSystemTemplate());
    }
    if (!registry.has("CCTV")) {
      registry.register(new CctvSystemTemplate());
    }
  }

  public detectSystemIntent(prompt: string): SystemDetectionMatch | null {
    const lower = prompt.toLowerCase();

    // 1. Gypsum Board detection
    if (
      lower.includes("gypsum") ||
      lower.includes("drywall") ||
      prompt.includes("جبس") ||
      prompt.includes("جبسوم") ||
      prompt.includes("جبسين") ||
      prompt.includes("جبسبورد")
    ) {
      const areaMatch =
        prompt.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|meter|meters|متر|م²|م٢)/i) ||
        prompt.match(/(?:مساحة|area)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);

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
        },
      };
    }

    // 2. CCTV System detection
    if (
      lower.includes("cctv") ||
      lower.includes("camera") ||
      lower.includes("cameras") ||
      prompt.includes("كاميرا") ||
      prompt.includes("كاميرات") ||
      prompt.includes("سيستم 8 كاميرات") ||
      prompt.includes("سيستم كاميرات")
    ) {
      const cameraMatch =
        prompt.match(/(\d+)\s*(?:cameras?|cctv|كاميرات?|كاميرا)/i) ||
        prompt.match(/(?:سيستم|system)\s*(\d+)\s*كاميرا/i) ||
        prompt.match(/(\d+)-(?:camera|كاميرا)/i);

      let projectContext = "villa";
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
        },
      };
    }

    return null;
  }

  public calculateSystem(
    systemType: string,
    inputs: Record<string, any>,
  ): SystemCalculationResult | null {
    const template = globalSystemTemplateRegistry.get(systemType);
    if (!template) return null;
    return template.calculate(inputs);
  }
}
