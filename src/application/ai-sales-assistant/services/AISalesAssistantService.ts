import type { AISalesAssistantPort } from "../ports/AISalesAssistantPort";
import { AISalesAssistantExtractor } from "./AISalesAssistantExtractor";
import type { AISalesAssistantResolverDependencies } from "./AISalesAssistantResolver";
import { AISalesAssistantResolver } from "./AISalesAssistantResolver";
import type {
  AISalesAssistantRequest,
  SalesAssistantDraftProposal,
} from "../dto/AISalesAssistantDto";
import { SALES_ASSISTANT_PROMPT_MAX_LENGTH } from "../dto/AISalesAssistantDto";
import { completeEstimatedPricing } from "./completeEstimatedPricing";
import { cleanCustomerEntity, fallbackCompanyEntity } from "./customer-entity";

export class AISalesAssistantService {
  private readonly extractor: AISalesAssistantExtractor;
  private readonly resolver: AISalesAssistantResolver;

  constructor(
    dependencies: AISalesAssistantResolverDependencies,
    private readonly provider?: AISalesAssistantPort | null,
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
      await this.extractor.extractIntent(prompt, sourceLocale, request.buildMode, request.answers, request.systemAnswers);
    for (const key of ["subject", "brief", "currencyCode"] as const) {
      if (request.retainedContext?.[key]) intent[key] = request.retainedContext[key];
    }
    if (request.retainedContext?.scopeType) intent.scopeType = request.retainedContext.scopeType;
    if (request.answers?.customerMention) intent.customerMention = cleanCustomerEntity(request.answers.customerMention) ?? fallbackCompanyEntity(request.answers.customerMention);
    if (request.answers?.projectName) intent.projectName = request.answers.projectName;
    for (const field of ["attentionName", "expiryDate", "paymentTerms", "delivery", "warranty"] as const) {
      if (request.answers?.[field]) intent[field] = request.answers[field];
    }
    for (const field of request.notApplicable ?? []) {
      if (["projectName", "attentionName", "expiryDate", "delivery", "warranty"].includes(field)) {
        intent[field as "projectName" | "attentionName" | "expiryDate" | "delivery" | "warranty"] = null;
      }
    }
    // Carry editable line intent through targeted replies, but always resolve IDs,
    // units, prices and tax again. SmartSystem remains the only BOM authority.
    if (!intent.smartSystem && request.retainedLines?.length) {
      intent.lines = request.retainedLines.map((line) => ({
        text: line.text, itemNameAr: line.itemNameAr, itemNameEn: line.itemNameEn,
        quantity: line.quantity, description: line.description,
        requestedUnitText: line.requestedUnitText, requestedPrice: line.requestedPrice, typeIntent: line.typeIntent,
      }));
    }

    const proposal = await this.resolver.resolveProposal(
      request.companyId,
      intent,
      sourceLocale,
      extractionMode,
      warnings,
      request.selection,
      request.notApplicable,
    );
    return completeEstimatedPricing(proposal, this.provider);
  }
}
