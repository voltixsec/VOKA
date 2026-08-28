/** Local-only visual fixture. No authentication bypass, database, or AI calls.
 * Run: npx vite --config scripts/qa/commercial-assistant-preview/vite.config.mts
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import SalesAssistantPage from "../../../app/dashboard/sales-assistant/page";
import NewQuotationPage from "../../../app/dashboard/quotations/new/page";
import { DashboardHeader } from "../../../components/dashboard/DashboardHeader";
import { LanguageProvider, useLanguage } from "../../../components/i18n/LanguageProvider";
import { CctvSystemTemplate } from "../../../src/domain/smart-system/CctvSystemTemplate";
import "../../../app/globals.css";

const system = new CctvSystemTemplate().calculate({ cameraCount: 36, includeInstallation: true });
// Only the isolated preview uses this fixture; never contact a real endpoint.
function fixture(isArabic: boolean) { return {
  id: "visual-fixture", operation: "QUOTATION", documentMode: "AUTO", buildMode: "AUTO",
  fields: { customerMention: isArabic ? 'شركة الأفق' : 'Horizon', lines: [] }, turns: [], contextText: "CCTV NVR",
  status: "READY_FOR_REVIEW", missingRequired: [],
  proposedCustomerName: isArabic ? 'شركة الأفق' : 'Horizon', customerState: 'CUSTOMER_PROPOSED_UNREGISTERED',
  recommended: [{ key: "paymentTerms", labelAr: "شروط الدفع", labelEn: "Payment terms" }],
  customerResolution: { status: "NOT_FOUND", candidates: [] },
  clarification: null,
  canonicalProposal: { customer: { id: null, status: 'MISSING', candidates: [], proposedCustomerName: isArabic ? 'شركة الأفق' : 'Horizon' }, estimateNotice: true, smartSystem: system, proposal: { currencyCode: "KWD" }, lines: system.components.map((c) => ({
    itemName: c.name, itemNameAr: c.nameAr, itemNameEn: c.nameEn, quantity: c.quantity,
    unitName: c.unit, requestedUnitText: c.unit, provenance: c.provenance,
    formulaExplanation: c.formulaExplanation, formulaExplanationAr: c.formulaExplanationAr,
    resolutionStatus: "CUSTOM", catalogCandidates: [], unitPrice: null,
  })) },
  requiresHumanReview: true, executed: false,
}; }
window.fetch = async (input, init) => {
  const url = String(input);
  let data: unknown = [];
  if (url === '/api/ai/commercial-conversation') data = fixture(JSON.parse(String(init?.body)).locale === 'ar');
  else if (url === '/api/customers' && init?.method === 'POST') {
    const form = JSON.parse(String(init.body));
    data = { customer: { id: 'preview-customer', name: form.nameAr || form.nameEn || form.name, nameAr: form.nameAr, nameEn: form.nameEn } };
  } else if (url.startsWith('/api/customers')) data = { customers: [] };
  else if (url === '/api/auth/me') data = { activeCompanyId: 'preview-only', user: { id: 'preview', name: 'System Administrator', email: '' } };
  else if (url === '/api/companies/current') data = { defaultCurrency: 'KWD' };
  else if (url.endsWith('/quotation-terms')) data = { templates: [] };
  else if (url.startsWith('/api/notifications')) data = { notifications: [], unreadCount: 0 };
  return new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
};

function Preview() {
  const { setLanguage, isArabic } = useLanguage();
  const [quotation, setQuotation] = useState(false);
  useEffect(() => { const navigate = () => setQuotation(true); window.addEventListener('preview-quotation', navigate); return () => window.removeEventListener('preview-quotation', navigate); }, []);
  return <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
    <nav aria-label="Preview language" className="mb-4 flex gap-3">
      <button onClick={() => setLanguage("ar")}>{isArabic ? 'العربية' : 'Arabic'}</button>
      <button onClick={() => setLanguage("en")}>{isArabic ? 'الإنجليزية' : 'English'}</button>
      <button onClick={() => setQuotation(false)}>{isArabic ? 'المساعد' : 'Assistant'}</button>
    </nav>
    <DashboardHeader />
    {quotation ? <NewQuotationPage /> : <SalesAssistantPage />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<LanguageProvider><Preview /></LanguageProvider>);
