"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function CompanySubNav({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const base = `/companies/${companyId}`;

  const items = [
    { href: base, label: "Overview" },
    { href: `${base}/research`, label: "Research" },
    { href: `${base}/thesis`, label: "Thesis" },
    { href: `${base}/valuation`, label: "Valuation" },
    { href: `${base}/journal`, label: "Journal" },
  ];

  return (
    <nav
      aria-label="Company"
      className="flex flex-wrap gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-800"
    >
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
