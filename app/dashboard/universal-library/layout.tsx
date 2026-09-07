import type {
  ReactNode,
} from "react";
import UniversalLibraryOperatorNav from "@/components/universal-library/UniversalLibraryOperatorNav";
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

  return <><UniversalLibraryOperatorNav />{children}</>;
}
