import { describe, expect, it } from "vitest";

import {
  awaitingBulkWizardProcess,
  emptyBulkWizardRecordCounts,
  pendingBulkWizardRecords,
  succeededBulkWizardRecords,
} from "../BatchWizardContract";

describe("BatchWizardContract counts", () => {
  it("separates pending, succeeded and failed without double-counting incomplete review", () => {
    const counts = {
      ...emptyBulkWizardRecordCounts(),
      total: 6,
      received: 2,
      processing: 1,
      needsReview: 2,
      incompleteReview: 1,
      failed: 1,
      published: 0,
    };

    expect(pendingBulkWizardRecords(counts)).toBe(4);
    expect(succeededBulkWizardRecords(counts)).toBe(1);
    expect(awaitingBulkWizardProcess(counts)).toBe(5);
  });
});
