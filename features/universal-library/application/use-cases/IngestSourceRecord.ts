import { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { UniversalIngestionRecord } from "../../domain/entities/UniversalIngestionRecord";
import { NormalizationPipelineService, RawIngestionPayloadInput } from "../../domain/normalization/NormalizationPipelineService";
import { IdentityResolutionService } from "../../domain/identity-resolution/IdentityResolutionService";
import { createHash } from "crypto";

export interface IngestSourceRecordParams {
  sourceId: string;
  sourceExternalId: string;
  entityType?: string;
  rawPayload: RawIngestionPayloadInput;
}

export interface IngestSourceRecordResult {
  ingestionRecord: UniversalIngestionRecord;
  isDuplicatePayload: boolean;
  isNewRecord: boolean;
}

export class IngestSourceRecord {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  public async execute(params: IngestSourceRecordParams): Promise<IngestSourceRecordResult> {
    const { sourceId, sourceExternalId, entityType, rawPayload } = params;

    if (!sourceId || sourceId.trim() === "") {
      throw new Error("sourceId is required");
    }
    if (!sourceExternalId || sourceExternalId.trim() === "") {
      throw new Error("sourceExternalId is required");
    }

    // 1. Verify source existence and active status
    const source = await this.repository.getSourceById(sourceId);
    if (!source) {
      throw new Error(`Universal source with ID '${sourceId}' not found.`);
    }
    if (!source.isActive) {
      throw new Error(`Universal source '${source.name}' (${sourceId}) is currently inactive.`);
    }

    // 2. Compute payload SHA-256 fingerprint hash
    const rawPayloadJson = rawPayload as unknown as Record<string, unknown>;
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(rawPayloadJson))
      .digest("hex");

    // 3. Check existing record for idempotency
    const existing = await this.repository.getIngestionRecordBySourceExternalId(sourceId, sourceExternalId);

    if (existing) {
      if (existing.payloadHash === payloadHash) {
        // Idempotent hit: exact same payload received repeatedly
        return {
          ingestionRecord: existing,
          isDuplicatePayload: true,
          isNewRecord: false,
        };
      }
    }

    // 4. Normalize payload safely
    let normalized;
    let normalizeError: string | null = null;
    try {
      normalized = NormalizationPipelineService.normalize(rawPayload);
    } catch (err: any) {
      normalizeError = err.message || "Failed to normalize raw payload";
    }

    if (normalizeError || !normalized) {
      const record = await this.repository.saveIngestionRecord({
        sourceId,
        sourceExternalId,
        entityType: entityType || "ITEM",
        rawPayload: rawPayloadJson,
        payloadHash,
        status: "REJECTED",
        errorMessage: normalizeError || "Invalid raw payload",
      });
      return {
        ingestionRecord: record,
        isDuplicatePayload: false,
        isNewRecord: !existing,
      };
    }

    // 5. Identity resolution lookup with strict manufacturer scoping
    const resolution = await IdentityResolutionService.resolveIdentity(
      normalized,
      sourceId,
      sourceExternalId,
      {
        findItemBySourceExternalRef: async (sId, extId) => {
          const rec = await this.repository.getIngestionRecordBySourceExternalId(sId, extId);
          return rec?.matchedItemId ? { id: rec.matchedItemId } : null;
        },
        findItemByGlobalIdentifier: async (type, val) => {
          const item = await this.repository.lookupByIdentifier({
            identifierType: type as any,
            value: val,
          });
          return item ? { id: item.id } : null;
        },
        findItemByManufacturerMpn: async (mId, mName, mpn) => {
          const res = await this.repository.searchItems({
            query: mpn,
            limit: 10,
          });
          const matched = res.items.find(
            it => {
              const mfrMatch = (mId && it.manufacturerId === mId) ||
                (mName && it.manufacturer?.name.toLowerCase() === mName.toLowerCase());
              if (!mfrMatch) return false;
              return it.modelNumber?.toUpperCase() === mpn.toUpperCase() ||
                     it.identifiers.some(id => id.identifierType === "MPN" && id.normalizedValue === mpn);
            }
          );
          return matched ? { id: matched.id } : null;
        },
        findItemByManufacturerModel: async (mId, mName, model) => {
          const res = await this.repository.searchItems({
            modelNumber: model,
            limit: 10,
          });
          const matched = res.items.find(
            it => {
              const mfrMatch = (mId && it.manufacturerId === mId) ||
                (mName && it.manufacturer?.name.toLowerCase() === mName.toLowerCase());
              if (!mfrMatch) return false;
              return it.modelNumber?.toUpperCase() === model.toUpperCase();
            }
          );
          return matched ? { id: matched.id } : null;
        },
        findItemsByConservativeName: async (name, mName) => {
          const res = await this.repository.searchItems({
            query: name,
            limit: 5,
          });
          return res.items
            .filter(it => it.name.toLowerCase() === name && (!mName || it.manufacturer?.name.toLowerCase() === mName.toLowerCase()))
            .map(it => ({ id: it.id }));
        },
      }
    );

    const record = await this.repository.saveIngestionRecord({
      sourceId,
      sourceExternalId,
      entityType: entityType || "ITEM",
      rawPayload: rawPayloadJson,
      payloadHash,
      status: resolution.status as any,
      normalizedData: normalized as unknown as Record<string, unknown>,
      matchedItemId: resolution.matchedItemId,
      errorMessage: resolution.status === "NEEDS_REVIEW" ? "Ambiguous match or low confidence requires manual review" : null,
    });

    return {
      ingestionRecord: record,
      isDuplicatePayload: false,
      isNewRecord: !existing,
    };
  }
}
