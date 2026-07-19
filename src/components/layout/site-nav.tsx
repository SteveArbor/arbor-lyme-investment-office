"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Only links to pages that actually exist and work. Per the Foundation
 * brief: navigation prepares for future pages structurally (this is where
 * a new link is added as each phase ships) but must never show an
 * unfinished module as if it were active functionality.
 */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus:ring-2 focus:ring-neutral-500 focus:outline-none ${
              isActive
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
