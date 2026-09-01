import { describe, expect, it } from "vitest";
import { asksForProductOptions } from "../product-options";

describe("product options intent regression", () => {
  it.each([
    "دورلي على ماركات",
    "شوفلي ماركات مناسبة",
    "هاتلي ماركات حقيقية",
    "هاتلي أفضل 3 اختيارات",
    "شوفلي أفضل 3 اختيارات حقيقية مناسبة للكويت",
    "ابحثلي على النت",
    "دور على النت",
    "شوف الموجود في الكويت",
  ])("recognizes live Arabic product research wording: %s", (message) => {
    expect(asksForProductOptions(message)).toBe(true);
  });
});
