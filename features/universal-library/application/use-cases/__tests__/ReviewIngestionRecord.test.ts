import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ReviewIngestionRecord,
} from "../ReviewIngestionRecord";

describe(
  "ReviewIngestionRecord",
  () => {
    it(
      "publishes only after an explicit approve decision with actor identity",
      async () => {
        const publishIngestionRecord =
          vi.fn().mockResolvedValue({
            item: {
              id: "ucl-item-1",
            },
            isNewItem: true,
          });

        const repository = {
          publishIngestionRecord,
          rejectIngestionRecord:
            vi.fn(),
        } as any;

        const result =
          await new ReviewIngestionRecord(
            repository,
          ).execute({
            ingestionRecordId:
              "ingestion-1",
            decision:
              "APPROVE",
            reviewedByUserId:
              "platform-user-1",
            reviewNote:
              "Evidence accepted",
          });

        expect(
          publishIngestionRecord,
        ).toHaveBeenCalledWith({
          ingestionRecordId:
            "ingestion-1",
          reviewedByUserId:
            "platform-user-1",
          reviewNote:
            "Evidence accepted",
        });

        expect(result.status)
          .toBe("PUBLISHED");
      },
    );

    it(
      "rejects through the explicit governed decision path",
      async () => {
        const rejectIngestionRecord =
          vi.fn().mockResolvedValue({
            id: "ingestion-2",
            status: "REJECTED",
          });

        const repository = {
          publishIngestionRecord:
            vi.fn(),
          rejectIngestionRecord,
        } as any;

        const result =
          await new ReviewIngestionRecord(
            repository,
          ).execute({
            ingestionRecordId:
              "ingestion-2",
            decision:
              "REJECT",
            reviewedByUserId:
              "platform-user-1",
          });

        expect(
          rejectIngestionRecord,
        ).toHaveBeenCalled();

        expect(result.status)
          .toBe("REJECTED");
      },
    );

    it(
      "requires an explicit review actor",
      async () => {
        const repository = {
          publishIngestionRecord:
            vi.fn(),
          rejectIngestionRecord:
            vi.fn(),
        } as any;

        await expect(
          new ReviewIngestionRecord(
            repository,
          ).execute({
            ingestionRecordId:
              "ingestion-3",
            decision:
              "APPROVE",
            reviewedByUserId:
              "   ",
          }),
        ).rejects.toThrow(
          "Explicit review actor",
        );
      },
    );
  },
);
