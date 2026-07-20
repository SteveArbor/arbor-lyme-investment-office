import type { Metadata } from "next";

import { EmptyStateCard } from "@/components/ui/empty-state-card";

export const metadata: Metadata = {
  title: "Documents — Arbor Lyme Capital",
};

export default function DocumentsPage() {
  return (
    <EmptyStateCard
      title="Documents"
      description="Filings, annual reports, and other source documents for this company will be stored and searchable here."
      phase="Planned — Phase 3, Document Repository"
    />
  );
}
