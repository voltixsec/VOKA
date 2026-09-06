import type {
  ReactNode,
} from "react";
import {
  redirect,
} from "next/navigation";

import {
  getCurrentUser,
  isPlatformAdmin,
} from "@/lib/auth";

export default async function UniversalLibraryOperatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth =
    await getCurrentUser();

  if (!isPlatformAdmin(auth)) {
    redirect("/dashboard");
  }

  return children;
}
