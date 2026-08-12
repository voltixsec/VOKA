import { GetDocumentVerificationUseCase } from "@/src/application/document-verification/DocumentVerification";
import { PrismaDocumentVerificationRepository } from "@/src/infrastructure/persistence/prisma/document-verification/PrismaDocumentVerificationRepository";

const verifyDocument = new GetDocumentVerificationUseCase(new PrismaDocumentVerificationRepository());

export default async function VerificationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const document = await verifyDocument.execute(token);
  const cancelled = document?.result === "CANCELLED";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">VOKA Document Verification</p>
        <h1 className={`mt-5 text-3xl font-bold ${!document ? "text-red-300" : cancelled ? "text-amber-300" : "text-emerald-300"}`}>
          {!document ? "Invalid document" : cancelled ? "Cancelled" : "Verified / Approved"}
        </h1>
        {!document ? (
          <p className="mt-4 text-slate-400">This verification token is invalid or the document is unavailable.</p>
        ) : (
          <dl className="mt-8 grid gap-5 sm:grid-cols-2">
            {[
              ["Document type", "Quotation"], ["Document number", document.documentNumber],
              ["Issuing company", document.issuingCompanyName], ["Current status", document.status],
              ["Issue date", document.issueDate.toISOString().slice(0, 10)],
              ["Approval date", document.approvalDate?.toISOString().slice(0, 10) ?? "-"],
              ["Total value", `${document.currencyCode} ${document.totalValue.toFixed(3)}`],
            ].map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
          </dl>
        )}
      </section>
    </main>
  );
}
