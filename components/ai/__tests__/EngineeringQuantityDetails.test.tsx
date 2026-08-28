// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EngineeringQuantityDetails, type EngineeringReviewLine } from "../EngineeringQuantityDetails";
import { EstimateNotice } from "../EstimateNotice";

const lines: EngineeringReviewLine[] = [
  { itemName: "Storage capacity", quantity: 94, unitName: "TB", quantitySource: "RULE_CALCULATED", formulaExplanation: "36 cameras × 8 Mbps × 30 days; capacity only, not a disk count." },
  { itemName: "Cabinet", quantity: 1, unitName: "Unit", quantitySource: "AI_ESTIMATED", formulaExplanation: "Estimated one shared cabinet; dimensions and locations require review." },
];

describe("engineering quantity explanations", () => {
  it.each([false, true])("exposes original calculations/assumptions in closed details and preserves the notice (Arabic=%s)", (isArabic) => {
    const { container } = render(<><EstimateNotice isArabic={isArabic} /><EngineeringQuantityDetails lines={lines} isArabic={isArabic} /></>);
    expect(container.querySelector("details")?.open).toBe(false);
    expect(screen.getByText(lines[0].formulaExplanation!)).toBeTruthy();
    expect(screen.getByText(lines[1].formulaExplanation!)).toBeTruthy();
    expect(screen.getByText(isArabic ? "كمية تقديرية — تحتاج مراجعة" : "Estimated quantity — review required")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain(isArabic ? "يلزم مراجعتها قبل الاعتماد" : "Review is required before approval");
    expect(container.textContent).toContain("94 TB");
  });

  it("does not invent an explanation when an older draft lacks one", () => {
    render(<EngineeringQuantityDetails lines={[{ ...lines[1], formulaExplanation: undefined }]} isArabic={false} />);
    expect(screen.getByText("Calculation/assumption details were not supplied; human confirmation is required.")).toBeTruthy();
  });

  it("distinguishes engineering capacity units from a different catalog unit", () => {
    const { container } = render(<EngineeringQuantityDetails lines={[{ ...lines[0], unitName: "Piece", requestedUnitText: "TB" }]} isArabic={false} />);
    expect(container.textContent).toContain("94 TB");
    expect(screen.getByText(/Commercial unit differs/).textContent).toContain("Piece");
  });
});
