// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedLineItem } from "@/src/application/ai-sales-assistant/dto/AISalesAssistantDto";
import { CommercialCatalogChoices } from "../CommercialCatalogChoices";
import { EngineeringQuantityDetails } from "../EngineeringQuantityDetails";
import { commercializeSystemComponent } from "@/src/application/ai-sales-assistant/services/commercialize-system-component";
import { CctvSystemTemplate } from "@/src/domain/smart-system";

describe("commercial BOM review UI", () => {
  it.each([true, false])("shows localized options with commercial quantities and submits the actual candidate identity (%s)", (isArabic) => {
    const line = { itemName: "Storage supply package", itemNameAr: "حزمة توريد تخزين", catalogCandidates: [{ id: "real-hdd", name: "HDD 18TB", nameEn: "Surveillance HDD 18TB", nameAr: "قرص مراقبة 18TB", quantity: 26, unitName: "Unit" }] } as ResolvedLineItem;
    const onSelect = vi.fn();
    const { container } = render(<CommercialCatalogChoices line={line} isArabic={isArabic} disabled={false} onSelect={onSelect} />);
    expect(container.textContent).toContain(isArabic ? "26 وحدة" : "26 Unit");
    expect(container.textContent?.replace(/HDD|TB/gi, '')).not.toMatch(isArabic ? /[a-z]/i : /[\u0600-\u06ff]/);
    expect(container.querySelector('.flex-wrap')).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ id: "real-hdd", name: "HDD 18TB" });
  });

  it.each([true, false])("keeps catalog-match and internal engineering review distinct, inside collapsed details (%s)", (isArabic) => {
    const system = new CctvSystemTemplate().calculate({ cameraCount: 180 });
    const commercial = commercializeSystemComponent(system.components[2], isArabic ? 'ar' : 'en', system);
    const { container } = render(<EngineeringQuantityDetails isArabic={isArabic} lines={[{
      itemName: commercial.text, itemNameAr: commercial.itemNameAr, itemNameEn: commercial.itemNameEn,
      quantity: 26, unitName: 'Unit', provenance: 'CALCULATED',
      formulaExplanation: 'ceil(467 / 18) = 26; bays and reserve not verified.', formulaExplanationAr: 'تقريب لأعلى (467 ÷ 18) = 26؛ لم يتم تأكيد الفتحات والاحتياطي.',
      commercialRequirement: { ...commercial.commercialRequirement!, quantity: 26, unit: 'Unit', matchStatus: 'COMMERCIAL_MATCH_CONFIRMED' },
    }]} />);
    expect(container.querySelector('details')?.open).toBe(false);
    expect(container.textContent).toContain(isArabic ? 'ليست اعتماداً للتصميم' : 'not design approval');
    expect(container.textContent).toContain('1.2.0');
    expect(container.textContent).not.toContain('COMMERCIAL_MATCH_CONFIRMED');
    expect(container.textContent).not.toMatch(isArabic ? /[a-z]/i : /[\u0600-\u06ff]/);
  });
});
