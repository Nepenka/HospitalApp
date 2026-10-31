"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SiteHeaderVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The root layout persists during navigation, so visibility follows the live route.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return children;
}
