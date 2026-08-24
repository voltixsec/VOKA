import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Cairo } from "next/font/google";

import { DashboardHeader } from "../../components/dashboard/DashboardHeader";
import { Sidebar } from "../../components/dashboard/Sidebar";
import { LanguageProvider } from "../../components/i18n/LanguageProvider";
import { getCurrentUser } from "../../lib/auth";
import { ApiError } from "../../lib/api/ApiError";
import { sanitizeReturnTo } from "../../lib/auth/return-to";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-voka",
});

function isUnauthenticatedError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.statusCode === 401;
  }
  return false;
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Server layout level pathname capture limitation:
  // Next.js App Router layouts do not reliably expose requested sub-paths without custom middleware header injection.
  // We use /dashboard as the safe server-gate fallback and preserve exact sub-paths via client-side 401 redirects.
  let requestedPath = "/dashboard";

  try {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") || headersList.get("next-url") || "";

    if (pathname && pathname.startsWith("/dashboard")) {
      requestedPath = sanitizeReturnTo(pathname);
    }
  } catch {
    // If headers read fails, default requestedPath remains /dashboard
  }

  try {
    await getCurrentUser();
  } catch (error) {
    if (isUnauthenticatedError(error)) {
      const returnToParam = encodeURIComponent(requestedPath);
      redirect(`/login?returnTo=${returnToParam}`);
    }

    // Re-throw non-auth infrastructure/Prisma/database errors unchanged
    throw error;
  }

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
