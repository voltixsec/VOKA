// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EngineeringQuantityDetails, engineeringReviewLines, type EngineeringReviewLine } from "../EngineeringQuantityDetails";
import { EstimateNotice } from "../EstimateNotice";

const lines: EngineeringReviewLine[] = [
  { itemName: "Storage capacity", itemNameAr: "سعة التخزين", itemNameEn: "Storage capacity", quantity: 94, unitName: "TB", quantitySource: "RULE_CALCULATED", formulaExplanation: "36 cameras × 8 Mbps × 30 days; capacity only, not a disk count.", formulaExplanationAr: "36 كاميرا × 8 ميجابت/ثانية × 30 يوم؛ سعة فقط وليست عدد أقراص." },
  { itemName: "Cabinet", itemNameAr: "كابينة", itemNameEn: "Cabinet", quantity: 1, unitName: "Unit", quantitySource: "AI_ESTIMATED", formulaExplanation: "Estimated one shared cabinet; dimensions and locations require review.", formulaExplanationAr: "كابينة مشتركة واحدة تقديرياً؛ تحتاج الأبعاد والمواقع إلى مراجعة." },
];

describe("engineering quantity explanations", () => {
  it('projects internal requirements separately without changing commercial quantities', () => {
    const proposal = { lines: [{ ...lines[1], itemName: 'Storage supply package', commercializationPending: true }], smartSystem: { requirements: [{ name: 'Required capacity', nameEn: 'Required capacity', nameAr: 'السعة المطلوبة', quantity: 337, unit: 'TB', provenance: 'CALCULATED', formulaExplanation: 'Internal formula' }] } } as any;
    const review = engineeringReviewLines(proposal);
    expect(review[0]).toMatchObject({ quantity: 337, unitName: 'TB' });
    expect(review[1]).toMatchObject({ quantity: 1, itemName: 'Storage supply package' });
    expect(proposal.lines).toHaveLength(1);
    expect(proposal.lines[0].quantity).toBe(1);
  });

  it.each([false, true])("exposes original calculations/assumptions in closed details and preserves the notice (Arabic=%s)", (isArabic) => {
    const { container } = render(<><EstimateNotice isArabic={isArabic} /><EngineeringQuantityDetails lines={lines} isArabic={isArabic} /></>);
    expect(container.querySelector("details")?.open).toBe(false);
    expect(screen.getByText((isArabic ? lines[0].formulaExplanationAr : lines[0].formulaExplanation)!)).toBeTruthy();
    expect(screen.getByText((isArabic ? lines[1].formulaExplanationAr : lines[1].formulaExplanation)!)).toBeTruthy();
    expect(screen.getByText(isArabic ? "كمية تقديرية — تحتاج مراجعة" : "Estimated quantity — review required")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain(isArabic ? "يلزم مراجعتها قبل الاعتماد" : "Review is required before approval");
    expect(container.textContent).toContain("94 TB");
    expect(container.textContent?.replace(/TB/g, "")).not.toMatch(isArabic ? /[a-z]/i : /[\u0600-\u06ff]/);
  });

  it("does not invent an explanation when an older draft lacks one", () => {
    render(<EngineeringQuantityDetails lines={[{ ...lines[1], formulaExplanation: undefined }]} isArabic={false} />);
    expect(screen.getByText("Calculation/assumption details are unavailable in English; human confirmation is required.")).toBeTruthy();
  });

  it("distinguishes engineering capacity units from a different catalog unit", () => {
    const { container } = render(<EngineeringQuantityDetails lines={[{ ...lines[0], unitName: "Piece", requestedUnitText: "TB" }]} isArabic={false} />);
    expect(container.textContent).toContain("94 TB");
    expect(screen.getByText(/Commercial unit differs/).textContent).toContain("Piece");
  });

  it.each([
    [false, "Jurisdiction", "Non-government-verified"],
    [true, "الدولة", "غير موثق من جهة حكومية"],
  ] as const)("renders pure internal rule labels without claiming Kuwait authority (Arabic=%s)", (isArabic, jurisdictionLabel, verificationLabel) => {
    const rules = { id: 'default', name: 'Engineering Default', jurisdiction: 'Kuwait', version: '1.0', trust: 'ENGINEERING_DEFAULT' as const, authoritySource: null, governmentVerified: false, resolvedAt: '2026-08-28T00:00:00.000Z', overriddenFields: [], values: { retentionDays: 30, codec: 'H.265' as const, resolutionMp: 4, fps: 15, bitrateMbps: 8, storageReservePercent: 10, nvrUtilizationPercent: 80, poeReservedPorts: 2, cableMetersPerCamera: 30, cableRollMeters: 305, rackAllowance: 1 } };
    const { container } = render(<EngineeringQuantityDetails lines={lines} isArabic={isArabic} rules={rules} />);
    expect(screen.getByText(jurisdictionLabel)).toBeTruthy();
    expect(screen.getByText(verificationLabel)).toBeTruthy();
    expect(container.textContent).toContain('1.0');
    expect(container.textContent).toContain(isArabic ? 'إتش.265' : 'H.265');
    const withoutTechnicalTokens = container.textContent?.replace(/H\.265|MP|FPS|NVR|TB/g, '') ?? '';
    expect(withoutTechnicalTokens).not.toMatch(isArabic ? /Jurisdiction|Profile|Retention|Verification/ : /[\u0600-\u06ff]/);
  });
});
