type PositionedLine = {
  position?: number;
};

export function normalizeQuotationLinePositions<T extends PositionedLine>(
  lines: T[],
): Array<T & { position: number }> {
  return lines.map((line, index) => ({
    ...line,
    position: index + 1,
  }));
}

export function moveQuotationLine<T extends PositionedLine>(
  lines: T[],
  index: number,
  direction: "up" | "down",
): Array<T & { position: number }> {
  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (
    index < 0 ||
    index >= lines.length ||
    targetIndex < 0 ||
    targetIndex >= lines.length
  ) {
    return normalizeQuotationLinePositions(lines);
  }

  const reordered = [...lines];
  [reordered[index], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[index],
  ];

  return normalizeQuotationLinePositions(reordered);
}
