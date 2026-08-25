import { describe, expect, it } from "vitest";
import { assertTakeoffConfirmable, validateDrawingUpload, validateTakeoffLines } from "../DrawingTakeoffPolicy";
describe("DrawingTakeoffPolicy", () => {
  it("accepts a bounded PDF with explicit intent", () => { const file = new File(["%PDF-"], "cctv.pdf", { type: "application/pdf" }); expect(validateDrawingUpload(file, "Count CCTV devices only").sourceSizeBytes).toBe(5); });
  it("rejects non-PDF and empty commercial intent", () => { expect(() => validateDrawingUpload(new File(["x"], "plan.png", { type: "image/png" }), "Count CCTV")).toThrow(/PDF/); expect(() => validateDrawingUpload(new File(["x"], "plan.pdf", { type: "application/pdf" }), " ")).toThrow(/intent/); });
  it("rejects zero and negative engineering quantities", () => { for (const quantity of [0, -2]) expect(() => validateTakeoffLines([{ itemName: "Camera", quantity, provenance: "DRAWING_COUNTED" }])).toThrow(/positive/); });
  it("keeps uncertain extraction unconfirmed and blocks completion", () => { const lines = validateTakeoffLines([{ itemName: "Cable route", quantity: null, provenance: "NEEDS_CONFIRMATION", isConfirmed: false }]); expect(() => assertTakeoffConfirmable(lines)).toThrow(/confirmed/); });
  it("requires explicit confirmation even for deterministic counts", () => { const lines = validateTakeoffLines([{ itemName: "Camera", quantity: 8, unitName: "each", provenance: "DRAWING_COUNTED" }]); expect(() => assertTakeoffConfirmable(lines)).toThrow(/confirmed/); lines[0].isConfirmed = true; expect(() => assertTakeoffConfirmable(lines)).not.toThrow(); });
});
