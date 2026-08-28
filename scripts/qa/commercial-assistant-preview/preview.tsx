/** Local-only visual fixture. No authentication bypass, database, or AI calls.
 * Run: npx vite --config scripts/qa/commercial-assistant-preview/vite.config.mts
 */
import React from "react";
import { createRoot } from "react-dom/client";
import SalesAssistantPage from "../../../app/dashboard/sales-assistant/page";
import { LanguageProvider, useLanguage } from "../../../components/i18n/LanguageProvider";
import { CctvSystemTemplate } from "../../../src/domain/smart-system/CctvSystemTemplate";
import "../../../app/globals.css";

const system = new CctvSystemTemplate().calculate({ cameraCount: 36, includeInstallation: true });
// Only the isolated preview uses this fixture; never contact a real endpoint.
window.fetch = async () => new Response(JSON.stringify({ data: {
  id: "visual-fixture", operation: "QUOTATION", documentMode: "AUTO", buildMode: "AUTO",
  fields: { customerMention: null, lines: [] }, turns: [], contextText: "CCTV NVR",
  status: "NEEDS_CLARIFICATION", missingRequired: [{ key: "customer", labelAr: "العميل", labelEn: "Customer" }],
  recommended: [{ key: "paymentTerms", labelAr: "شروط الدفع", labelEn: "Payment terms" }],
  customerResolution: { status: "UNRESOLVED", candidates: [] },
  clarification: { ar: "من هو العميل؟", en: "Who is the customer?", suggestions: [] },
  canonicalProposal: { estimateNotice: true, smartSystem: system, proposal: { currencyCode: "KWD" }, lines: system.components.map((c) => ({
    itemName: c.name, itemNameAr: c.nameAr, itemNameEn: c.nameEn, quantity: c.quantity,
    unitName: c.unit, requestedUnitText: c.unit, provenance: c.provenance,
    formulaExplanation: c.formulaExplanation, formulaExplanationAr: c.formulaExplanationAr,
    resolutionStatus: "CUSTOM", catalogCandidates: [], unitPrice: null,
  })) },
  requiresHumanReview: true, executed: false,
} }), { headers: { "Content-Type": "application/json" } });

function Preview() {
  const { setLanguage } = useLanguage();
  return <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
    <nav aria-label="Preview language" className="mb-4 flex gap-3">
      <button onClick={() => setLanguage("ar")}>العربية</button>
      <button onClick={() => setLanguage("en")}>English</button>
    </nav>
    <SalesAssistantPage />
  </main>;
}
createRoot(document.getElementById("root")!).render(<LanguageProvider><Preview /></LanguageProvider>);
