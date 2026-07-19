// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SignInForm } from "./sign-in-form";

// The real ../actions module transitively imports "server-only"-guarded
// Supabase server code (correct in a real Next.js build, where the "use
// server" directive causes the framework's compiler to swap in a
// lightweight reference for client bundles instead of the real server
// code — a transform plain Vitest does not perform). Mocked here so this
// stays a true component-rendering test, not an accidental integration
// test of the server action's internals.
vi.mock("../actions", () => ({
  signInAction: vi.fn(),
}));

// Rendering/accessibility structure only — this does not submit the form.
// The submission path (including the real generic-error-message
// behaviour) is covered by the Playwright e2e journey instead, which runs
// against the actual running app where Next's server action machinery
// works correctly.
describe("SignInForm", () => {
  it("renders accessible, labelled email and password fields", () => {
    render(<SignInForm />);

    const email = screen.getByLabelText("Email address");
    expect(email).toBeInTheDocument();
    expect(email).toHaveAttribute("type", "email");
    expect(email).toBeRequired();

    const password = screen.getByLabelText("Password");
    expect(password).toBeInTheDocument();
    expect(password).toHaveAttribute("type", "password");
    expect(password).toBeRequired();
  });

  it("renders a submit button that is enabled by default", () => {
    render(<SignInForm />);

    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("does not render an error message before any submission", () => {
    render(<SignInForm />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
