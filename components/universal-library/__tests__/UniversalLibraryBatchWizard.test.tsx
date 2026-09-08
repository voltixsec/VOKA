// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/universal-library/batches",
}));

import UniversalLibraryBatchWizard from "../UniversalLibraryBatchWizard";
import { BATCH_WIZARD_STEPS } from "@/features/universal-library/domain/bulk-import/BatchWizardContract";

describe("UniversalLibraryBatchWizard", () => {
  it("renders the ten operator journey steps", () => {
    render(
      <UniversalLibraryBatchWizard
        sourceId=""
        batchExternalKey=""
        sourceNamespace=""
      />,
    );

    expect(screen.getByTestId("ucl-batch-wizard")).toBeTruthy();
    expect(
      screen.getByText(/File → Upload → Batch → Process → Staging/),
    ).toBeTruthy();

    for (const step of BATCH_WIZARD_STEPS) {
      const node = screen.getByTestId(`ucl-batch-wizard-step-${step.id}`);
      expect(node).toHaveAttribute("href", step.href);
      expect(node.textContent).toContain(step.label);
    }
  });

  it("keeps process, retry and resume controls in the operator surface", () => {
    const source = readFileSync(
      "components/universal-library/UniversalLibraryBatchWizard.tsx",
      "utf8",
    );
    const consoleSource = readFileSync(
      "components/universal-library/UniversalLibraryBatchesConsole.tsx",
      "utf8",
    );

    expect(source).toContain("/api/universal-library/bulk-import/ui/process");
    expect(source).toContain("/api/universal-library/bulk-import/ui/journey");
    expect(source).toContain("Retry failed / process remaining");
    expect(source).toContain("Resume failed chunks");
    expect(source).toContain("Partial/failure state");
    expect(consoleSource).toContain("Resume");
    expect(consoleSource).toContain("Process remaining");
    expect(consoleSource).toContain("UniversalLibraryBatchWizard");
  });
});
