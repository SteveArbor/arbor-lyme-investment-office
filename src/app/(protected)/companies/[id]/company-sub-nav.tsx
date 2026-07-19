import { NavLinks } from "@/components/ui/nav-links";

export function CompanySubNav({ companyId }: { companyId: string }) {
  const base = `/companies/${companyId}`;
  const items = [
    { href: base, label: "Overview" },
    { href: `${base}/research`, label: "Research" },
    { href: `${base}/thesis`, label: "Thesis" },
    { href: `${base}/valuation`, label: "Valuation" },
    { href: `${base}/journal`, label: "Journal" },
  ];

  return (
    <NavLinks
      ariaLabel="Company"
      items={items}
      className="flex flex-wrap gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-800"
    />
  );
}
