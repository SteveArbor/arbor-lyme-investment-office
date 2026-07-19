// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portfolio",
}));

import { NavLinks } from "./nav-links";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolios" },
  { href: "/journal", label: "Journal" },
];

describe("NavLinks", () => {
  it("renders every item as a link with the correct href", () => {
    render(<NavLinks ariaLabel="Primary" items={items} />);

    for (const item of items) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link).toHaveAttribute("href", item.href);
    }
  });

  it("marks only the link matching the current path as the active page", () => {
    render(<NavLinks ariaLabel="Primary" items={items} />);

    expect(screen.getByRole("link", { name: "Portfolios" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Journal" })).not.toHaveAttribute("aria-current");
  });

  it("exposes the given accessible name for the nav landmark", () => {
    render(<NavLinks ariaLabel="Primary" items={items} />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });
});
