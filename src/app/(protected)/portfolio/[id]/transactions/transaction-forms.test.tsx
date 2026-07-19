// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Company } from "@/domain/company";

// The real ../actions module imports server-only Supabase code that plain
// Vitest cannot transform (see sign-in-form.test.tsx for the same pattern).
vi.mock("./actions", () => ({
  recordBuyAction: vi.fn(),
  recordSellAction: vi.fn(),
  recordDividendAction: vi.fn(),
  recordCashAdjustmentAction: vi.fn(),
}));

import { TransactionForms } from "./transaction-forms";

const companies: Company[] = [
  {
    id: "company-1",
    ownerId: "user-1",
    name: "Acme Corp",
    ticker: "ACME",
    exchange: "NASDAQ",
    sector: "Technology",
    industry: "Software",
    currency: "USD",
    status: "holding",
    watchlist: false,
    notes: null,
    profile: null,
    createdAt: "now",
    updatedAt: "now",
  },
];

describe("TransactionForms", () => {
  it("shows the buy form by default, with a company selector", () => {
    render(<TransactionForms portfolioId="portfolio-1" companies={companies} />);

    expect(screen.getByRole("button", { name: "Record buy" })).toBeInTheDocument();
    expect(screen.getByLabelText("Company")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acme Corp (ACME)" })).toBeInTheDocument();
  });

  it("switches to the sell form when the Sell tab is clicked", () => {
    render(<TransactionForms portfolioId="portfolio-1" companies={companies} />);

    fireEvent.click(screen.getByRole("button", { name: "Sell" }));

    expect(screen.getByRole("button", { name: "Record sell" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record buy" })).not.toBeInTheDocument();
  });

  it("switches to the dividend form when the Dividend tab is clicked", () => {
    render(<TransactionForms portfolioId="portfolio-1" companies={companies} />);

    fireEvent.click(screen.getByRole("button", { name: "Dividend" }));

    expect(screen.getByRole("button", { name: "Record dividend" })).toBeInTheDocument();
  });

  it("switches to the cash adjustment form, which needs no company selector", () => {
    render(<TransactionForms portfolioId="portfolio-1" companies={companies} />);

    fireEvent.click(screen.getByRole("button", { name: "Cash adjustment" }));

    expect(screen.getByRole("button", { name: "Record adjustment" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();
  });

  it("prompts to add a company first when there are none, for company-scoped tabs", () => {
    render(<TransactionForms portfolioId="portfolio-1" companies={[]} />);

    expect(screen.getByText(/Add a company first/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record buy" })).not.toBeInTheDocument();
  });

  it("still shows the cash adjustment form when there are no companies", () => {
    render(<TransactionForms portfolioId="portfolio-1" companies={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Cash adjustment" }));

    expect(screen.getByRole("button", { name: "Record adjustment" })).toBeInTheDocument();
  });
});
