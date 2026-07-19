"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Shared active-link rendering for both the primary site nav and the
 * per-company sub-nav — extracted because the two had drifted into
 * identical copies of the same `usePathname`/`aria-current`/active-class
 * logic, differing only in their item list and outer layout classes.
 */
export function NavLinks({
  ariaLabel,
  items,
  className = "flex items-center gap-1",
}: {
  ariaLabel: string;
  items: readonly NavItem[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={ariaLabel} className={className}>
      {items.map((item) => {
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
