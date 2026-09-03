export type MarketRelevanceTarget =
  | "GLOBAL"
  | "MIDDLE_EAST"
  | "GCC"
  | "KUWAIT"
  | "SAUDI_ARABIA"
  | "EGYPT";

export const CANONICAL_SCOPE_GLOBAL = "GLOBAL" as const;

export const DISCOVERY_COLLECTION_BOUNDS = {
  MAX_ALIASES: 20,
  MAX_EVIDENCE: 20,
  MAX_SPECIFICATION_HINTS: 50,
  MAX_DEPENDENCY_HINTS: 50,
  MAX_MARKET_TARGETS: 10,
  MAX_COMPONENTS_PER_SEED: 100,
  MAX_POPULATION_WORK_ITEMS: 100,
} as const;

export function validateMarketRelevanceTargets(
  targets?: MarketRelevanceTarget[] | null
): MarketRelevanceTarget[] {
  if (!targets || targets.length === 0) {
    return ["GLOBAL"];
  }
  if (!Array.isArray(targets)) {
    throw new Error("Market relevance targets must be an array");
  }
  if (targets.length > DISCOVERY_COLLECTION_BOUNDS.MAX_MARKET_TARGETS) {
    throw new Error(
      `Market relevance targets exceed maximum bound of ${DISCOVERY_COLLECTION_BOUNDS.MAX_MARKET_TARGETS} items`
    );
  }
  const validTargets: MarketRelevanceTarget[] = [
    "GLOBAL",
    "MIDDLE_EAST",
    "GCC",
    "KUWAIT",
    "SAUDI_ARABIA",
    "EGYPT",
  ];
  for (const t of targets) {
    if (typeof t !== "string" || !validTargets.includes(t)) {
      throw new Error(`Invalid market relevance target: ${String(t)}`);
    }
  }
  return [...targets];
}

export function validateStringCollection(
  items: unknown,
  collectionName: string,
  maxBound: number
): string[] {
  if (items === null || items === undefined) {
    return [];
  }
  if (!Array.isArray(items)) {
    throw new Error(`${collectionName} must be an array of strings`);
  }
  if (items.length > maxBound) {
    throw new Error(`${collectionName} collection bound exceeded (${items.length} > ${maxBound})`);
  }
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") {
      throw new Error(`Invalid non-string member in ${collectionName}: ${String(item)}`);
    }
    const trimmed = item.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }
  return result;
}
