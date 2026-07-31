import type { ReactNode } from "react";
import { Cairo } from "next/font/google";

import { DashboardHeader } from "../../components/dashboard/DashboardHeader";
import { Sidebar } from "../../components/dashboard/Sidebar";
import { LanguageProvider } from "../../components/i18n/LanguageProvider";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-voka",
});

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LanguageProvider>
      <div
        className={`${cairo.className} ${cairo.variable} flex min-h-screen bg-slate-950 text-white`}
      >
        <Sidebar />

        <div className="min-w-0 flex-1">
          <DashboardHeader />

          <main className="px-8 py-8">
            {children}
          </main>
        </div>
      </div>
    </LanguageProvider>
  );
}
