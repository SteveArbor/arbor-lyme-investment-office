// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real ./actions module imports server-only Supabase code that plain
// Vitest cannot transform (see sign-in-form.test.tsx for the same pattern).
// Representative of the many similar simple create/edit forms in this
// codebase (research-form, valuation-form, create-portfolio-form,
// generate-rating-form all follow this exact shape) — this test exercises
// the pattern once rather than duplicating it per form.
vi.mock("./actions", () => ({
  createCompanyAction: vi.fn(),
}));

import { CompanyForm } from "./company-form";

describe("CompanyForm", () => {
  it("renders every required field, labelled and accessible", () => {
    render(<CompanyForm />);

    for (const label of ["Company name", "Ticker", "Exchange", "Currency", "Sector", "Industry"]) {
      const field = screen.getByLabelText(label);
      expect(field).toBeInTheDocument();
      expect(field).toBeRequired();
    }
  });

  it("defaults currency to USD and status to researching", () => {
    render(<CompanyForm />);

    expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    expect(screen.getByLabelText("Status")).toHaveValue("researching");
  });

  it("defaults the watchlist checkbox to unchecked", () => {
    render(<CompanyForm />);

    expect(screen.getByRole("checkbox", { name: "Add to watchlist" })).not.toBeChecked();
  });

  it("renders a submit button that is enabled by default", () => {
    render(<CompanyForm />);

    const button = screen.getByRole("button", { name: "Add company" });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("does not render an error message before any submission", () => {
    render(<CompanyForm />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
