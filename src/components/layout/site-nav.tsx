import { NavLinks } from "@/components/ui/nav-links";

/**
 * Only links to pages that actually exist and work. Per the Foundation
 * brief: navigation prepares for future pages structurally (this is where
 * a new link is added as each phase ships) but must never show an
 * unfinished module as if it were active functionality.
 */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/companies", label: "Companies" },
  { href: "/portfolio", label: "Portfolios" },
  { href: "/journal", label: "Journal" },
  { href: "/settings", label: "Settings" },
] as const;

export function SiteNav() {
  return <NavLinks ariaLabel="Primary" items={NAV_ITEMS} />;
}
