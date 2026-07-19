// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ThesisStatement } from "@/domain/thesis";

// The real ../actions module imports server-only Supabase code that plain
// Vitest cannot transform (correct in a real Next.js build — see
// sign-in-form.test.tsx for the same pattern). Mocked so this stays a true
// component-behaviour test.
vi.mock("./actions", () => ({
  updateThesisAction: vi.fn(),
}));

import { ThesisForm } from "./thesis-form";

function hiddenStatementsInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[name="statements"]') as HTMLInputElement;
}

describe("ThesisForm", () => {
  it("starts with a single empty statement when the company has none yet", () => {
    const { container } = render(<ThesisForm companyId="company-1" statements={[]} />);

    expect(screen.getAllByLabelText("Statement")).toHaveLength(1);
    const rows = JSON.parse(hiddenStatementsInput(container).value);
    expect(rows).toEqual([{ description: "", confidence: 0.5, status: "stable" }]);
  });

  it("renders one row per existing statement, pre-filled", () => {
    const statements: ThesisStatement[] = [
      { id: "s1", description: "Durable moat", confidence: 0.9, status: "strengthening" },
      { id: "s2", description: "Margin pressure", confidence: 0.4, status: "weakening" },
    ];

    render(<ThesisForm companyId="company-1" statements={statements} />);

    expect(screen.getByDisplayValue("Durable moat")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Margin pressure")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Statement")).toHaveLength(2);
  });

  it("adds a new empty statement row when 'Add statement' is clicked", () => {
    const { container } = render(<ThesisForm companyId="company-1" statements={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));

    expect(screen.getAllByLabelText("Statement")).toHaveLength(2);
    const rows = JSON.parse(hiddenStatementsInput(container).value);
    expect(rows).toHaveLength(2);
  });

  it("removes a statement row when 'Remove statement' is clicked, but not the last one", () => {
    const statements: ThesisStatement[] = [
      { id: "s1", description: "First", confidence: 0.5, status: "stable" },
      { id: "s2", description: "Second", confidence: 0.5, status: "stable" },
    ];
    render(<ThesisForm companyId="company-1" statements={statements} />);

    const removeButtons = screen.getAllByRole("button", { name: "Remove statement" });
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons[0]).toBeEnabled();

    fireEvent.click(removeButtons[0]);

    expect(screen.getAllByLabelText("Statement")).toHaveLength(1);
    // The sole remaining row cannot itself be removed.
    expect(screen.getByRole("button", { name: "Remove statement" })).toBeDisabled();
  });

  it("keeps the hidden statements input in sync as fields are edited", () => {
    const { container } = render(<ThesisForm companyId="company-1" statements={[]} />);

    fireEvent.change(screen.getByLabelText("Statement"), {
      target: { value: "Strong balance sheet" },
    });
    fireEvent.change(screen.getByLabelText("Confidence (0–1)"), { target: { value: "0.8" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "strengthening" } });

    const rows = JSON.parse(hiddenStatementsInput(container).value);
    expect(rows).toEqual([
      { description: "Strong balance sheet", confidence: 0.8, status: "strengthening" },
    ]);
  });

  it("does not show a status message before any submission", () => {
    render(<ThesisForm companyId="company-1" statements={[]} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
