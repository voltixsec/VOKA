import { describe, expect, it } from "vitest";
import { classifyCommercialOperation } from "../CommercialOperationClassifier";
describe("CommercialOperationClassifier", () => {
  it.each([["اعمل عرض سعر للعميل", "QUOTATION"], ["أنشئ فاتورة للعميل", "INVOICE"], ["جهز عقد توريد", "CONTRACT"], ["اعمل أمر بيع", "SALES_ORDER"], ["سجل دفعة 250 دينار على الفاتورة", "PAYMENT"], ["حلل المخطط واعمل عرض سعر", "DRAWING_TAKEOFF"], ["Create an invoice for ACME", "INVOICE"]] as const)("routes %s", (prompt, operation) => expect(classifyCommercialOperation(prompt)).toMatchObject({ operation, confidence: "EXPLICIT" }));
  it("does not guess an ambiguous generic request", () => expect(classifyCommercialOperation("أنشئ مستند للعميل")).toMatchObject({ operation: null, confidence: "AMBIGUOUS" }));
  it("requires review when two consequential operations are explicit", () => expect(classifyCommercialOperation("Create a quotation and invoice")).toMatchObject({ operation: null, candidates: ["INVOICE", "QUOTATION"] }));
});
