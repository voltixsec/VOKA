import type { SystemComponent } from "@/src/domain/smart-system";
import type { CommercialMaterialAttributes, SolutionBomLine } from "./types";

function compact(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function appendDistinct(base: string, parts: Array<string | null | undefined>) {
  const result = compact(base) ?? "";
  return parts.reduce<string>((current, raw) => {
    const value = compact(raw);
    if (!value || current.normalize("NFKC").toLocaleLowerCase().includes(value.normalize("NFKC").toLocaleLowerCase())) return current;
    return current ? current + ", " + value : value;
  }, result);
}

function attributeParts(attributes: CommercialMaterialAttributes | undefined, ar: boolean) {
  if (!attributes) return [];
  return [
    attributes.subtype,
    attributes.resolution,
    attributes.capacity,
    attributes.channels == null ? null : ar ? attributes.channels + " قناة" : attributes.channels + " Channel",
    attributes.diskBays == null ? null : ar ? attributes.diskBays + " فتحة قرص" : attributes.diskBays + " HDD Bays",
    attributes.ports == null ? null : ar ? attributes.ports + " منفذ" : attributes.ports + " Ports",
    attributes.packageSize,
    attributes.material,
    attributes.grade,
    attributes.dimensions,
    ...(attributes.features ?? []),
  ];
}

/** Builds the single customer-facing identity used by the Workspace and Quotation handoff. */
export function projectCommercialBomLine(line: SolutionBomLine): SolutionBomLine {
  const identity = [compact(line.brand), compact(line.model)];
  const itemNameEn = appendDistinct(line.itemNameEn, [...identity, ...attributeParts(line.commercialAttributes, false)]);
  const itemNameAr = appendDistinct(line.itemNameAr, [...identity, ...attributeParts(line.commercialAttributes, true)]);
  const productSelectionStatus = line.productSelectionStatus
    ?? (line.brand || line.model || line.catalogItemId ? "SELECTED" : line.type === "PRODUCT" ? "GENERIC" : "GENERIC");
  const pricingStatus = line.pricingStatus
    ?? (line.unitPrice !== null ? "CONFIRMED" : line.marketPrice ? "MARKET_REFERENCE_AVAILABLE" : "PENDING");
  const engineeringStatus = line.engineeringStatus ?? (line.quantityState === "CONFIRMED" ? "EXACT" : "ESTIMATED");
  return {
    ...line,
    itemName: itemNameEn || line.itemName,
    itemNameAr,
    itemNameEn,
    productSelectionStatus,
    engineeringStatus,
    pricingStatus,
  };
}

/** Selects only commercially material component facts; formulas stay in the engineering layer. */
export function commercialAttributesFromComponent(component: SystemComponent): CommercialMaterialAttributes | undefined {
  const specification = component.specification ?? {};
  const key = component.componentKey.toUpperCase();
  const number = (key: string) => typeof specification[key] === "number" ? specification[key] as number : null;
  const text = (key: string) => typeof specification[key] === "string" ? compact(specification[key] as string) : null;
  const attributes: CommercialMaterialAttributes = {
    subtype: text("subtype"),
    resolution: key.includes("CAMERA") && number("resolutionMp") != null ? number("resolutionMp") + "MP" : null,
    capacity: key.includes("HDD") || key.includes("STORAGE") ? (number("driveCapacityTb") == null ? text("capacity") : number("driveCapacityTb") + "TB") : null,
    channels: key.includes("NVR") || key.includes("RECORDER") ? number("channelsPerRecorder") : null,
    diskBays: key.includes("NVR") || key.includes("RECORDER") ? number("diskBaysPerRecorder") : null,
    ports: key.includes("SWITCH") ? number("portsPerSwitch") : null,
    packageSize: key.includes("CABLE") ? (number("metersPerRoll") == null ? text("packageSize") : number("metersPerRoll") + "m roll") : null,
    material: text("material"),
    grade: text("grade"),
    dimensions: text("dimensions"),
  };
  return Object.values(attributes).some((value) => value !== null && value !== undefined) ? attributes : undefined;
}
