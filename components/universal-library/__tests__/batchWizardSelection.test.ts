// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  BATCH_WIZARD_SELECTION_KEY,
  readBatchWizardSelection,
  writeBatchWizardSelection,
} from "../batchWizardSelection";

describe("batch wizard selection persistence", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a selected batch across reopen", () => {
    writeBatchWizardSelection({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(window.localStorage.getItem(BATCH_WIZARD_SELECTION_KEY)).toContain(
      "WIZARD_BATCH_001",
    );
    expect(readBatchWizardSelection()).toEqual({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });
  });

  it("ignores blank or malformed storage", () => {
    writeBatchWizardSelection({
      sourceId: "source-1",
      batchExternalKey: "   ",
      sourceNamespace: "NS",
    });
    expect(readBatchWizardSelection()).toBeNull();

    window.localStorage.setItem(BATCH_WIZARD_SELECTION_KEY, "{not json");
    expect(readBatchWizardSelection()).toBeNull();
  });
});
