export const BATCH_WIZARD_STEPS = [
  {
    id: "FILE",
    label: "File",
    href: "/dashboard/universal-library/batches",
  },
  {
    id: "UPLOAD",
    label: "Upload",
    href: "/dashboard/universal-library/batches",
  },
  {
    id: "BATCH",
    label: "Batch",
    href: "/dashboard/universal-library/batches",
  },
  {
    id: "PROCESS",
    label: "Process",
    href: "/dashboard/universal-library/batches",
  },
  {
    id: "STAGING",
    label: "Staging",
    href: "/dashboard/universal-library/products",
  },
  {
    id: "HIERARCHY",
    label: "Hierarchy",
    href: "/dashboard/universal-library/systems",
  },
  {
    id: "PRODUCTS",
    label: "Products",
    href: "/dashboard/universal-library/products",
  },
  {
    id: "REVIEW",
    label: "Review",
    href: "/dashboard/universal-library/review",
  },
  {
    id: "PUBLISH",
    label: "Publish",
    href: "/dashboard/universal-library/published",
  },
  {
    id: "STATUS_HISTORY",
    label: "Status / History",
    href: "/dashboard/universal-library/batches",
  },
] as const;

export type BatchWizardStepId =
  (typeof BATCH_WIZARD_STEPS)[number]["id"];

export type BatchWizardStepState =
  | "LOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETE"
  | "PARTIAL"
  | "ERROR";

export type BatchWizardOverallStatus =
  | "IDLE"
  | "IN_PROGRESS"
  | "NEEDS_ATTENTION"
  | "READY_TO_PROCESS"
  | "IN_REVIEW"
  | "COMPLETE"
  | "FAILED";

export interface BulkWizardRecordCounts {
  total: number;
  received: number;
  normalized: number;
  matched: number;
  processing: number;
  needsReview: number;
  published: number;
  rejected: number;
  failed: number;
  incompleteReview: number;
}

export function emptyBulkWizardRecordCounts(): BulkWizardRecordCounts {
  return {
    total: 0,
    received: 0,
    normalized: 0,
    matched: 0,
    processing: 0,
    needsReview: 0,
    published: 0,
    rejected: 0,
    failed: 0,
    incompleteReview: 0,
  };
}

export function awaitingBulkWizardProcess(
  counts: BulkWizardRecordCounts,
): number {
  return (
    counts.received +
    counts.normalized +
    counts.matched +
    counts.failed +
    counts.incompleteReview
  );
}
