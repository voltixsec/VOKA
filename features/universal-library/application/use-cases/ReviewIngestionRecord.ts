import type {
  IUniversalLibraryRepository,
} from "../../domain";

export type IngestionReviewDecision =
  | "APPROVE"
  | "REJECT";

export interface ReviewIngestionRecordParams {
  ingestionRecordId: string;
  decision: IngestionReviewDecision;
  reviewedByUserId: string;
  reviewNote?: string | null;
}

export class ReviewIngestionRecord {
  constructor(
    private readonly repository:
      IUniversalLibraryRepository,
  ) {}

  public async execute(
    params: ReviewIngestionRecordParams,
  ) {
    const ingestionRecordId =
      params.ingestionRecordId.trim();

    const reviewedByUserId =
      params.reviewedByUserId.trim();

    const reviewNote =
      params.reviewNote?.trim() || null;

    if (!ingestionRecordId) {
      throw new Error(
        "ingestionRecordId is required.",
      );
    }

    if (!reviewedByUserId) {
      throw new Error(
        "Explicit review actor is required.",
      );
    }

    if (
      reviewNote &&
      reviewNote.length > 1000
    ) {
      throw new Error(
        "reviewNote must not exceed 1000 characters.",
      );
    }

    if (
      params.decision ===
      "APPROVE"
    ) {
      const result =
        await this.repository.publishIngestionRecord({
          ingestionRecordId,
          reviewedByUserId,
          reviewNote,
        });

      return {
        status: "PUBLISHED" as const,
        item: result.item,
        isNewItem:
          result.isNewItem,
      };
    }

    const record =
      await this.repository.rejectIngestionRecord({
        ingestionRecordId,
        reviewedByUserId,
        reviewNote,
      });

    return {
      status: "REJECTED" as const,
      record,
    };
  }
}
