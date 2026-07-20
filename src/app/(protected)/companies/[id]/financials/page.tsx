import type { Metadata } from "next";

import { EmptyStateCard } from "@/components/ui/empty-state-card";

export const metadata: Metadata = {
  title: "Financials — Arbor Lyme Capital",
};

export default function FinancialsPage() {
  return (
    <EmptyStateCard
      title="Financials"
      description="Imported financial statements, fundamentals, and historical ratios will appear here once a data provider is connected. No financial data is fabricated or estimated in the meantime."
      phase="Planned — future phase"
    />
  );
}
