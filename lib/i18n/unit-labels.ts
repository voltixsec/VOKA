const unitLabels: Record<string, [string, string]> = {
  unit: ['وحدة', 'Unit'], piece: ['قطعة', 'Piece'], pcs: ['قطعة', 'Pieces'],
  roll: ['بكرة', 'Roll'], set: ['طقم', 'Set'], point: ['نقطة', 'Point'],
  package: ['حزمة', 'Package'], sheet: ['لوح', 'Sheet'], pair: ['زوج', 'Pair'],
  lm: ['متر طولي', 'Linear metre'], m: ['متر', 'm'], 'm²': ['م²', 'm²'], kg: ['كجم', 'kg'],
};

/** Display only. Never use to replace canonical unit codes or quantities. */
export function unitLabel(unit: string | null | undefined, isArabic: boolean): string {
  const value = unit?.trim() ?? '';
  const lookup = isArabic ? value.replace(/\s*\(PCS\)$/i, '') : value;
  const known = unitLabels[lookup.toLowerCase()] ?? Object.values(unitLabels).find(([ar, en]) => ar === lookup || en === lookup);
  return known?.[isArabic ? 0 : 1] ?? value;
}

export function commercialUnitLabel(line: { unitName?: string | null; unitNameAr?: string | null; unitNameEn?: string | null }, isArabic: boolean) {
  const localized = isArabic ? line.unitNameAr : line.unitNameEn;
  // Legacy editor placeholders must not override the real catalog unit label.
  const value = localized && localized !== 'PCS' ? localized : line.unitName || localized;
  return !isArabic && value === 'PCS' ? value : unitLabel(value, isArabic);
}
