import { createHash } from "node:crypto";
import { AcquisitionEnvelope } from "../../domain";
import { IngestSourceRecord } from "../../application/use-cases/IngestSourceRecord";
import { IAcquisitionStager, PreviewDisposition } from "../../application/acquisition";
import { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { stableJsonStringify } from "../../domain/normalization/stableJson";

export class Ucl3AcquisitionStager implements IAcquisitionStager {
  private readonly ingest: IngestSourceRecord;
  constructor(private readonly repository: IUniversalLibraryRepository) { this.ingest = new IngestSourceRecord(repository); }
  public async preview(sourceId: string, envelope: AcquisitionEnvelope): Promise<PreviewDisposition> {
    const existing = await this.repository.getIngestionRecordBySourceExternalId(sourceId, envelope.externalRecordId);
    if (!existing) return "NEW";
    const hash = createHash("sha256").update(stableJsonStringify(envelope.rawPayload)).digest("hex");
    return existing.payloadHash === hash ? "DUPLICATE" : "CHANGED";
  }
  public async stage(sourceId: string, runId: string, envelope: AcquisitionEnvelope): Promise<{ disposition: PreviewDisposition; status: string }> {
    const result = await this.ingest.execute({ sourceId, sourceExternalId: envelope.externalRecordId, rawPayload: envelope.rawPayload as any, acquisitionRunId: runId, canonicalSourceUrl: envelope.canonicalSourceUrl, fetchedAt: envelope.fetchedAt, attributionText: envelope.attribution });
    const disposition: PreviewDisposition = result.isDuplicatePayload ? "DUPLICATE" : result.isNewRecord ? "NEW" : "CHANGED";
    return { disposition, status: result.ingestionRecord.status };
  }
}
