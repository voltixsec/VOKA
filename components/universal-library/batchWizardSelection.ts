export const BATCH_WIZARD_SELECTION_KEY =
  "voka.ucl.batch-wizard.selection";

export type BatchWizardSelection = {
  sourceId: string;
  batchExternalKey: string;
  sourceNamespace: string;
};

function isSelection(
  value: unknown,
): value is BatchWizardSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.sourceId === "string" &&
    record.sourceId.trim().length > 0 &&
    typeof record.batchExternalKey === "string" &&
    record.batchExternalKey.trim().length > 0 &&
    typeof record.sourceNamespace === "string"
  );
}

export function readBatchWizardSelection(): BatchWizardSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(BATCH_WIZARD_SELECTION_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    return isSelection(parsed)
      ? {
          sourceId: parsed.sourceId.trim(),
          batchExternalKey: parsed.batchExternalKey.trim(),
          sourceNamespace: parsed.sourceNamespace.trim(),
        }
      : null;
  } catch {
    return null;
  }
}

export function writeBatchWizardSelection(
  selection: BatchWizardSelection,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const sourceId = selection.sourceId.trim();
  const batchExternalKey = selection.batchExternalKey.trim();
  const sourceNamespace = selection.sourceNamespace.trim();

  if (!sourceId || !batchExternalKey) {
    return;
  }

  window.localStorage.setItem(
    BATCH_WIZARD_SELECTION_KEY,
    JSON.stringify({
      sourceId,
      batchExternalKey,
      sourceNamespace,
    }),
  );
}
