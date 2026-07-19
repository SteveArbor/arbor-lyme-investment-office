// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyStateCard } from "./empty-state-card";

describe("EmptyStateCard", () => {
  it("renders the title, description, and phase, and never invented data", () => {
    render(
      <EmptyStateCard
        title="Portfolio summary"
        description="Holdings will appear here."
        phase="Planned — Phase 2"
      />
    );

    expect(screen.getByRole("heading", { name: "Portfolio summary" })).toBeInTheDocument();
    expect(screen.getByText("Holdings will appear here.")).toBeInTheDocument();
    expect(screen.getByText("Planned — Phase 2")).toBeInTheDocument();
    // No numeric-looking content should ever be rendered by this
    // component -- it exists specifically to avoid presenting mock figures.
    expect(screen.queryByText(/£|\$|%/)).not.toBeInTheDocument();
  });
});
