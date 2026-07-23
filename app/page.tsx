const featureCards = [
  {
    title: 'AI-powered quotation creation',
    description: 'Convert conversations into polished proposals with instant AI assistance.',
    accent: 'Auto-generated quotes'
  },
  {
    title: 'Smart conversation capture',
    description: 'Collect customer requests and translate them into professional offers.',
    accent: 'Conversation-driven workflow'
  },
  {
    title: 'Ready for teams',
    description: 'Keep your pipeline moving with shared controls, templates, and analytics.',
    accent: 'Scale without friction'
  }
];

const workflowSteps = [
  {
    title: 'Talk to VOKA',
    description: 'Share the customer conversation, requirements, or brief directly in chat.'
  },
  {
    title: 'Generate fast',
    description: 'VOKA drafts quotes, line items, and next steps in a polished format.'
  },
  {
    title: 'Send with confidence',
    description: 'Review, personalize, and deliver the proposal instantly.'
  }
];

const faqs = [
  {
    question: 'Can VOKA connect to my CRM?',
    answer: 'Yes. VOKA is designed to fit into modern sales workflows and can be extended to sync with your CRM via APIs.'
  },
  {
    question: 'How quickly can I create quotes?',
    answer: 'Most proposals are created in seconds after the conversation is captured, without manual formatting.'
  },
  {
    question: 'Is there a free trial?',
    answer: 'Start with a free onboarding period and explore VOKA before moving to a full team plan.'
  }
];

export default function Home() {
  return (
    <main className="relative overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-slate-900 via-slate-950 to-transparent opacity-80" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_top_right,_rgba(96,165,250,0.18),_transparent_40%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-72 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.14),_transparent_30%)]" />

      <section className="relative mx-auto max-w-7xl px-6 py-10 sm:px-10 lg:px-14">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-700/70 bg-white/5 px-4 py-2 text-sm text-slate-200 shadow-soft">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              Premium AI Sales Automation
            </div>
            <div className="mt-8 flex flex-col gap-6 lg:max-w-2xl">
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Talk. Done.</p>
                <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Your AI Sales Employee
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
                  Turn conversations into professional quotations in seconds using AI.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center rounded-full bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Start Free
                </a>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-slate-500 hover:bg-slate-900"
                >
                  Book Demo
                </a>
              </div>
            </div>
          </div>

          <div className="relative isolate overflow-hidden rounded-4xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.18),_transparent_35%)]" />
            <div className="relative space-y-6 text-slate-100">
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-soft">
                <p className="text-sm uppercase tracking-[0.24em] text-sky-300/80">Live demo</p>
                <h2 className="mt-3 text-2xl font-semibold">AI quote preview</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Intelligent proposals created directly from your sales conversations.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Status</p>
                  <p className="mt-3 text-2xl font-semibold text-white">Active</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Time saved</p>
                  <p className="mt-3 text-2xl font-semibold text-white"><span className="text-sky-300">+73%</span></p>
                </div>
              </div>
            </div>
          </div>
        </header>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 sm:px-10 lg:px-14">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6 rounded-4xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Features</p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Everything your sales team needs to move faster.</h2>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              VOKA blends real conversations, AI quotation drafting, and team-ready processes into one elegant workflow.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {featureCards.map((feature) => (
                <article key={feature.title} className="rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-soft">
                  <p className="text-sm uppercase tracking-[0.28em] text-slate-500">{feature.accent}</p>
                  <h3 className="mt-4 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-6 rounded-4xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-950/70 to-slate-900/90 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
            <div className="rounded-3xl bg-slate-950/90 p-6 ring-1 ring-white/10">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Why VOKA</p>
              <h3 className="mt-4 text-2xl font-semibold text-white">AI-first quoting for modern sales teams.</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Build proposals, keep approvals aligned, and use AI to reduce onboarding friction and close deals faster.
              </p>
            </div>
            <div className="grid gap-4">
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5">
                <p className="text-sm font-semibold text-white">Intelligent summary cards</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">Auto extract customer needs, line items, and next steps from conversations.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5">
                <p className="text-sm font-semibold text-white">Proposal templates</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">Use sleek sales templates that match your brand and keep quotes consistent.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">How VOKA Works</p>
            <h2 className="text-4xl font-semibold text-white sm:text-5xl">From conversation to quote in three simple steps.</h2>
            <p className="max-w-xl text-base leading-7 text-slate-300">
              VOKA listens to your discussion, writes the proposal, and helps you send it with confidence — all in one polished workflow.
            </p>
          </div>
          <div className="grid gap-4">
            {workflowSteps.map((step, index) => (
              <div key={step.title} className="rounded-4xl border border-white/10 bg-slate-900/85 p-8 shadow-soft">
                <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-800 text-xl font-semibold text-sky-300">
                  {index + 1}
                </div>
                <h3 className="mt-5 text-xl font-semibold text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 sm:px-10 lg:px-14" id="pricing">
        <div className="rounded-4xl border border-white/10 bg-slate-900/70 p-10 shadow-2xl shadow-slate-950/15 backdrop-blur-xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Pricing</p>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">Build with AI-enabled sales workflows.</h2>
              <p className="text-base leading-7 text-slate-300">
                Pricing coming soon — designed for teams that want speed, consistency, and insights from every conversation.
              </p>
            </div>
            <div className="rounded-3xl bg-slate-950/90 px-6 py-4 text-center ring-1 ring-white/10">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Placeholder</p>
              <p className="mt-3 text-3xl font-semibold text-white">Launching soon</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-5">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">FAQ</p>
            <h2 className="text-4xl font-semibold text-white sm:text-5xl">Frequently asked questions</h2>
            <p className="max-w-xl text-base leading-7 text-slate-300">
              Everything you need to know before you bring VOKA into your workflow.
            </p>
          </div>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-4xl border border-white/10 bg-slate-950/90 p-6 shadow-soft">
                <h3 className="text-lg font-semibold text-white">{faq.question}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-slate-950/60 px-6 py-10 text-slate-500 sm:px-10 lg:px-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xl font-semibold text-white">VOKA</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">A modern sales automation experience powered by AI.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-500">
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <a href="#demo" className="transition hover:text-white">Book Demo</a>
            <a href="#" className="transition hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
