import { PopulationWorkItem } from "./PopulationWorkItem";
import { IngestSourceRecord } from "../use-cases/IngestSourceRecord";
import { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { IngestionStatus } from "../../domain/entities/UniversalIngestionRecord";
import { RawIngestionPayloadInput } from "../../domain/normalization/NormalizationPipelineService";

export interface StagingBridgeOptions {
  sourceId?: string;
  acquisitionRunId?: string;
}

export interface StagingBridgeResultItem {
  workItemId: string;
  componentKey: string;
  disposition: "NEW" | "DUPLICATE" | "CHANGED" | "REJECTED";
  ingestionStatus: IngestionStatus;
  ingestionRecordId: string;
  errorMessage?: string | null;
}

export class SystemPopulationBridge {
  private readonly ingestUseCase: IngestSourceRecord;

  constructor(private readonly repository: IUniversalLibraryRepository) {
    this.ingestUseCase = new IngestSourceRecord(repository);
  }

  public async stageWorkItems(
    workItems: PopulationWorkItem[],
    options?: StagingBridgeOptions
  ): Promise<StagingBridgeResultItem[]> {
    const sourceId = options?.sourceId?.trim() || "web_search_discovery";
    const acquisitionRunId = options?.acquisitionRunId;

    const results: StagingBridgeResultItem[] = [];

    for (const item of workItems) {
      // 1. Convert PopulationWorkItem into RawIngestionPayloadInput
      const identifiers: Array<{ identifierType: string; value: string; source?: string | null }> = [];

      if (item.identityHints?.mpn) {
        identifiers.push({ identifierType: "MPN", value: item.identityHints.mpn });
      }
      if (item.identityHints?.modelNumber) {
        identifiers.push({ identifierType: "MODEL_NO", value: item.identityHints.modelNumber });
      }
      if (item.identityHints?.gtin) {
        identifiers.push({ identifierType: "GTIN", value: item.identityHints.gtin });
      }
      if (item.identityHints?.sku) {
        identifiers.push({ identifierType: "EXTERNAL_ID", value: item.identityHints.sku });
      }

      const attributes = (item.specificationHints || []).map((spec, index) => ({
        code: `SPEC_${index + 1}`,
        name: `Specification ${index + 1}`,
        dataType: "STRING",
        value: spec,
      }));

      const rawPayload: RawIngestionPayloadInput = {
        name: item.nameEn,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        descriptionEn: item.purpose,
        type: item.componentType === "SERVICE" ? "SERVICE" : "PRODUCT",
        categoryName: item.categoryHint,
        manufacturerName: item.identityHints?.manufacturerHint || null,
        brandName: item.identityHints?.brandHint || null,
        familyName: item.identityHints?.familyHint || null,
        modelNumber: item.identityHints?.modelNumber || null,
        identifiers: identifiers.length > 0 ? identifiers : undefined,
        attributes: attributes.length > 0 ? attributes : undefined,
      };

      // 2. Resolve primary canonical evidence URL and attribution
      const primaryEvidence = item.componentEvidence[0] || item.seedEvidence[0];
      const canonicalSourceUrl = primaryEvidence?.url || undefined;
      const attributionText = primaryEvidence
        ? `${primaryEvidence.publisher} - ${primaryEvidence.title}`
        : "Web Search Discovery";

      // 3. Invoke governed IngestSourceRecord use case
      try {
        const ingestResult = await this.ingestUseCase.execute({
          sourceId,
          sourceExternalId: item.id,
          entityType: item.componentType,
          rawPayload,
          acquisitionRunId,
          canonicalSourceUrl,
          attributionText,
        });

        const disposition = ingestResult.isDuplicatePayload
          ? "DUPLICATE"
          : ingestResult.isNewRecord
          ? "NEW"
          : "CHANGED";

        results.push({
          workItemId: item.id,
          componentKey: item.componentKey,
          disposition: ingestResult.ingestionRecord.status === "REJECTED" ? "REJECTED" : disposition,
          ingestionStatus: ingestResult.ingestionRecord.status,
          ingestionRecordId: ingestResult.ingestionRecord.id,
          errorMessage: ingestResult.ingestionRecord.errorMessage,
        });
      } catch (err: any) {
        results.push({
          workItemId: item.id,
          componentKey: item.componentKey,
          disposition: "REJECTED",
          ingestionStatus: "FAILED",
          ingestionRecordId: `failed-${Date.now()}`,
          errorMessage: err.message || "Failed to stage work item",
        });
      }
    }

    return results;
  }
}
