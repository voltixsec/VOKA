import Link from "next/link";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 lg:p-10">
      <div><p className="text-sm font-semibold text-sky-400">Workspace</p><h1 className="mt-2 text-3xl font-bold">Settings · الإعدادات</h1></div>
      <div className="grid gap-5 md:grid-cols-2">
        <Link href="/dashboard/settings/company" className="rounded-3xl border border-slate-800 bg-slate-900 p-6 hover:border-sky-600"><h2 className="text-xl font-bold">Company & brand</h2><p className="mt-2 text-sm text-slate-400">Identity, themes, document assets and delivery settings.</p></Link>
        <Link href="/dashboard/settings/signatories" className="rounded-3xl border border-slate-800 bg-slate-900 p-6 hover:border-sky-600"><h2 className="text-xl font-bold">Authorized signatories</h2><p className="mt-2 text-sm text-slate-400">Approval identity, signature and allowed document types.</p></Link>
      </div>
    </main>
  );
}
