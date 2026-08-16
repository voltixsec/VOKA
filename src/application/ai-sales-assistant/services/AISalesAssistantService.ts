import type { AISalesAssistantPort } from "../ports/AISalesAssistantPort";
import { AISalesAssistantExtractor } from "./AISalesAssistantExtractor";
import type { AISalesAssistantResolverDependencies } from "./AISalesAssistantResolver";
import { AISalesAssistantResolver } from "./AISalesAssistantResolver";
import type {
  AISalesAssistantRequest,
  SalesAssistantDraftProposal,
} from "../dto/AISalesAssistantDto";
import { SALES_ASSISTANT_PROMPT_MAX_LENGTH } from "../dto/AISalesAssistantDto";

export class AISalesAssistantService {
  private readonly extractor: AISalesAssistantExtractor;
  private readonly resolver: AISalesAssistantResolver;

  constructor(
    dependencies: AISalesAssistantResolverDependencies,
    provider?: AISalesAssistantPort | null,
  ) {
    this.extractor = new AISalesAssistantExtractor(provider);
    this.resolver = new AISalesAssistantResolver(dependencies);
  }

  async generateDraftProposal(
    request: AISalesAssistantRequest,
  ): Promise<SalesAssistantDraftProposal> {
    const prompt = request.prompt?.trim() ?? "";
    if (!prompt) {
      throw new Error("PROMPT_REQUIRED");
    }

    if (prompt.length > SALES_ASSISTANT_PROMPT_MAX_LENGTH) {
      throw new Error("PROMPT_EXCEEDS_MAX_LENGTH");
    }

    const sourceLocale =
      request.sourceLocale ??
      (/[\u0600-\u06FF]/.test(prompt) ? "ar" : "en");

    const { intent, extractionMode, warnings } =
      await this.extractor.extractIntent(prompt, sourceLocale);

    return this.resolver.resolveProposal(
      request.companyId,
      intent,
      sourceLocale,
      extractionMode,
      warnings,
    );
  }
}
