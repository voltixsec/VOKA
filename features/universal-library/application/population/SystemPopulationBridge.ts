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
  ingestionRecordId: string | null;
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

      const rawPayload: RawIngestionPayloadInput & {
        componentEvidence?: Array<{ url: string; title: string | null; publisher: string | null; sourceType: string | null; claimSupport: string[] }>;
        seedEvidence?: Array<{ url: string; title: string | null; publisher: string | null; sourceType: string | null; claimSupport: string[] }>;
      } = {
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
        componentEvidence: item.componentEvidence.map((e) => ({
          url: e.url,
          title: e.title,
          publisher: e.publisher,
          sourceType: e.sourceType,
          claimSupport: e.claimSupport,
        })),
        seedEvidence: item.seedEvidence.map((e) => ({
          url: e.url,
          title: e.title,
          publisher: e.publisher,
          sourceType: e.sourceType,
          claimSupport: e.claimSupport,
        })),
      };

      const primaryEvidence = item.componentEvidence[0] || item.seedEvidence[0];
      const canonicalSourceUrl = primaryEvidence?.url || undefined;
      const attributionText = primaryEvidence
        ? `${primaryEvidence.publisher} - ${primaryEvidence.title}`
        : "Web Search Discovery";

      try {
        const ingestResult = await this.ingestUseCase.execute({
          sourceId,
          sourceExternalId: item.id,
          entityType: "ITEM",
          rawPayload,
          acquisitionRunId,
          canonicalSourceUrl,
          attributionText,
        });

        let stagedRecord = ingestResult.ingestionRecord;
    const hasEvidence =
      item.componentEvidence.length > 0 || item.seedEvidence.length > 0;

    if (
      !hasEvidence &&
      (stagedRecord.status === "NORMALIZED" || stagedRecord.status === "MATCHED")
    ) {
      stagedRecord = await this.repository.updateIngestionRecordStatus(
        stagedRecord.id,
        "NEEDS_REVIEW",
        {
          errorMessage:
            "Discovery staged without grounded evidence and requires manual review",
        }
      );
    }

    const disposition = ingestResult.isDuplicatePayload
          ? "DUPLICATE"
          : ingestResult.isNewRecord
          ? "NEW"
          : "CHANGED";

        results.push({
          workItemId: item.id,
          componentKey: item.componentKey,
          disposition: stagedRecord.status === "REJECTED" ? "REJECTED" : disposition,
          ingestionStatus: stagedRecord.status,
          ingestionRecordId: stagedRecord.id,
          errorMessage: stagedRecord.errorMessage,
        });
      } catch (err: any) {
        results.push({
          workItemId: item.id,
          componentKey: item.componentKey,
          disposition: "REJECTED",
          ingestionStatus: "FAILED",
          ingestionRecordId: null,
          errorMessage: err.message || "Failed to stage work item",
        });
      }
    }

    return results;
  }
}
