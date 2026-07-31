const dashboardCards = [
  {
    title: 'Customers',
    value: '—',
    description: 'Total customer records',
  },
  {
    title: 'Open Quotations',
    value: '—',
    description: 'Waiting for customer action',
  },
  {
    title: 'Approved Deals',
    value: '—',
    description: 'Ready for contract or invoice',
  },
];

export default function DashboardPage() {
  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300">
          Overview
        </p>

        <h2 className="mt-3 text-3xl font-semibold text-white">
          Dashboard
        </h2>

        <p className="mt-2 max-w-2xl text-slate-400">
          Manage customers, products, quotations, contracts,
          and invoices from one workspace.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {dashboardCards.map((card) => (
          <article
            key={card.title}
            className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-soft"
          >
            <p className="text-sm text-slate-400">
              {card.title}
            </p>

            <p className="mt-4 text-4xl font-semibold text-white">
              {card.value}
            </p>

            <p className="mt-3 text-sm text-slate-500">
              {card.description}
            </p>
          </article>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8">
        <p className="text-sm font-medium text-sky-300">
          VOKA Sales Flow
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-xl bg-white/5 px-4 py-3">
            Customer
          </span>

          <span className="text-slate-600">→</span>

          <span className="rounded-xl bg-white/5 px-4 py-3">
            Quotation
          </span>

          <span className="text-slate-600">→</span>

          <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-emerald-200">
            Contract
          </span>

          <span className="text-slate-500">or</span>

          <span className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-sky-200">
            Invoice
          </span>
        </div>
      </div>
    </section>
  );
}
