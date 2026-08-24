import type { ISystemTemplate, SystemCalculationResult, SystemComponent, SystemInputParameter } from "./types";

type AccessDirection = "ENTRY_ONLY" | "ENTRY_EXIT";

export class AccessControlSystemTemplate implements ISystemTemplate {
  readonly systemType = "ACCESS_CONTROL";
  readonly templateVersion = "1.0.0";
  readonly displayNameAr = "نظام التحكم في الدخول";
  readonly displayNameEn = "Access Control System";

  calculate(raw: Record<string, any>): SystemCalculationResult {
    const missingInputs: string[] = [];
    const warnings: string[] = [];
    const providedDoors = raw.doorCount ?? raw.doors ?? null;
    const doorCount = Number.isInteger(providedDoors) && providedDoors > 0 && providedDoors <= 256 ? providedDoors as number : null;
    if (providedDoors == null) missingInputs.push("doorCount");
    else if (doorCount == null) warnings.push("Door count must be an integer from 1 to 256.");
    const providedDirection = typeof raw.accessDirection === "string" ? raw.accessDirection.toUpperCase() : null;
    const accessDirection: AccessDirection | null = providedDirection === "ENTRY_ONLY" || providedDirection === "ENTRY_EXIT" ? providedDirection : null;
    if (providedDirection == null) missingInputs.push("accessDirection");
    else if (accessDirection == null) warnings.push("Access direction must be ENTRY_ONLY or ENTRY_EXIT.");
    const includeInstallation = raw.includeInstallation === true;
    const providedCable = raw.cableMetersPerDoor;
    const cableMetersPerDoor = typeof providedCable === "number" && Number.isFinite(providedCable) && providedCable > 0 && providedCable <= 500 ? providedCable : null;
    if (includeInstallation && providedCable == null) missingInputs.push("cableMetersPerDoor");
    else if (providedCable != null && cableMetersPerDoor == null) warnings.push("Cable allowance per door must be greater than 0 and no more than 500 meters.");
    const inputs: SystemInputParameter[] = [
      { name: "doorCount", labelAr: "عدد الأبواب", labelEn: "Door Count", value: doorCount, unit: "Doors", provenance: doorCount == null ? "SUGGESTED" : "USER_PROVIDED" },
      { name: "accessDirection", labelAr: "اتجاه التحكم", labelEn: "Controlled Direction", value: accessDirection, provenance: accessDirection == null ? "SUGGESTED" : "USER_PROVIDED" },
      { name: "includeInstallation", labelAr: "يشمل التركيب", labelEn: "Include Installation", value: includeInstallation, provenance: raw.includeInstallation == null ? "SUGGESTED" : "USER_PROVIDED", isDefault: raw.includeInstallation == null },
      { name: "cableMetersPerDoor", labelAr: "طول الكابل لكل باب", labelEn: "Cable Allowance per Door", value: cableMetersPerDoor, unit: "m", provenance: cableMetersPerDoor == null ? "SUGGESTED" : "USER_PROVIDED" },
    ];
    const invalid = [
      ...(providedDoors != null && doorCount == null ? ["doorCount"] : []),
      ...(providedDirection != null && accessDirection == null ? ["accessDirection"] : []),
      ...(providedCable != null && cableMetersPerDoor == null ? ["cableMetersPerDoor"] : []),
    ];
    if (missingInputs.length || invalid.length) return { systemType: this.systemType, templateVersion: this.templateVersion, systemNameAr: this.displayNameAr, systemNameEn: this.displayNameEn, status: invalid.length ? "INVALID_INPUT" : "NEEDS_CONFIRMATION", inputs, missingInputs: [...missingInputs, ...invalid], warnings, components: [] };
    const doors = doorCount!;
    const readers = doors * (accessDirection === "ENTRY_EXIT" ? 2 : 1);
    const panels = Math.ceil(doors / 4);
    const components: SystemComponent[] = [
      { componentKey: "ACCESS_CONTROLLERS", name: "لوحات تحكم دخول (سعة 4 أبواب)", nameAr: "لوحات تحكم دخول (سعة 4 أبواب)", nameEn: "Access Control Panels (4-door capacity)", itemType: "PRODUCT", quantity: panels, unit: "Unit", provenance: "CALCULATED", formulaExplanation: `Math.ceil(${doors} doors / 4) = ${panels} panel(s)`, category: "HARDWARE" },
      { componentKey: "ACCESS_READERS", name: "قارئات دخول", nameAr: "قارئات دخول", nameEn: "Access Control Readers", itemType: "PRODUCT", quantity: readers, unit: "Unit", provenance: "CALCULATED", formulaExplanation: `${doors} doors × ${accessDirection === "ENTRY_EXIT" ? 2 : 1} controlled side(s) = ${readers} reader(s)`, category: "HARDWARE" },
      { componentKey: "ELECTRIC_LOCKS", name: "أقفال كهربائية", nameAr: "أقفال كهربائية", nameEn: "Electric Door Locks", itemType: "PRODUCT", quantity: doors, unit: "Unit", provenance: "CALCULATED", formulaExplanation: `1 lock per controlled door = ${doors}`, category: "HARDWARE" },
      { componentKey: "DOOR_CONTACTS", name: "حساسات حالة الباب", nameAr: "حساسات حالة الباب", nameEn: "Door Position Contacts", itemType: "PRODUCT", quantity: doors, unit: "Unit", provenance: "CALCULATED", formulaExplanation: `1 contact per controlled door = ${doors}`, category: "HARDWARE" },
      ...(accessDirection === "ENTRY_ONLY" ? [{ componentKey: "EXIT_BUTTONS", name: "أزرار خروج", nameAr: "أزرار خروج", nameEn: "Request-to-Exit Buttons", itemType: "PRODUCT" as const, quantity: doors, unit: "Unit", provenance: "CALCULATED" as const, formulaExplanation: `1 exit button per entry-only door = ${doors}`, category: "HARDWARE" }] : []),
      ...(includeInstallation ? [
        { componentKey: "ACCESS_CABLE", name: "كابل نظام التحكم بالدخول", nameAr: "كابل نظام التحكم بالدخول", nameEn: "Access Control System Cable", itemType: "PRODUCT" as const, quantity: doors * cableMetersPerDoor!, unit: "m", provenance: "CALCULATED" as const, formulaExplanation: `${doors} doors × ${cableMetersPerDoor} m = ${doors * cableMetersPerDoor!} m`, category: "INFRASTRUCTURE" },
        { componentKey: "ACCESS_INSTALLATION", name: "تركيب وبرمجة واختبار نقاط الدخول", nameAr: "تركيب وبرمجة واختبار نقاط الدخول", nameEn: "Access Point Installation, Programming & Testing", itemType: "SERVICE" as const, quantity: doors, unit: "Point", provenance: "CALCULATED" as const, formulaExplanation: `1 installation point per controlled door = ${doors}`, category: "SERVICE" },
      ] : []),
    ];
    warnings.push("Credential/card quantities, lock type, fire-alarm interface, and power backup require project-specific human confirmation.");
    return { systemType: this.systemType, templateVersion: this.templateVersion, systemNameAr: this.displayNameAr, systemNameEn: this.displayNameEn, status: "COMPLETE", inputs, missingInputs: [], warnings, components };
  }
}
