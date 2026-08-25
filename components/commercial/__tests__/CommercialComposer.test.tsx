// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommercialComposer, CommercialLineEditor, createCommercialLine } from "../index";

describe("shared Commercial Composer", () => {
  it.each([["INVOICE", true, "rtl"], ["CONTRACT", false, "ltr"]] as const)("renders %s with locale direction", (mode, isArabic, direction) => {
    const { container } = render(<CommercialComposer mode={mode} isArabic={isArabic} title="Title" description="Description"><div>Body</div></CommercialComposer>);
    expect(container.querySelector(`[data-commercial-composer="${mode}"]`)?.getAttribute("dir")).toBe(direction);
  });

  it("maps a catalog selection into the shared commercial line without saving", () => {
    const onChange = vi.fn();
    render(<CommercialLineEditor isArabic={false} currencyCode="KWD" lines={[createCommercialLine("line-1")]} items={[{ id: "camera-1", name: "Camera", code: "CAM", type: "PRODUCT", salePrice: 25, unitName: "PCS", taxPercentage: 5 }]} onChange={onChange} />);
    fireEvent.focus(screen.getByLabelText("Item 1"));
    fireEvent.click(screen.getByText("Camera"));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ catalogItemId: "camera-1", type: "PRODUCT", unitPrice: 25, taxPercentage: 5 })]);
  });

  it("keeps one line and disables destructive removal", () => {
    render(<CommercialLineEditor isArabic currencyCode="KWD" lines={[createCommercialLine("line-1")]} items={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "حذف البند 1" })).toBeDisabled();
  });
});
