import type { Metadata } from "next";

import { EmptyStateCard } from "@/components/ui/empty-state-card";

export const metadata: Metadata = {
  title: "AI Analysis — Arbor Lyme Capital",
};

export default function AiAnalysisPage() {
  return (
    <EmptyStateCard
      title="AI Analysis"
      description="AI-assisted summaries and analysis will appear here, built entirely from this company's own research, thesis, valuation, and decision records — never invented data."
      phase="Planned — Phase 4, AI Analysis and Daily Briefing"
    />
  );
}
