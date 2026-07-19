"use client";

import { useActionState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
  successTextClasses,
} from "@/components/ui/form-styles";

import { type ActionFormState, generateRatingAction } from "./actions";

const initialState: ActionFormState = { error: null, success: false };

const SCORE_FIELDS = [
  { name: "businessQuality", label: "Business quality (0–1)" },
  { name: "economicMoat", label: "Economic moat (0–1)" },
  { name: "financialStrength", label: "Financial strength (0–1)" },
  { name: "capitalAllocation", label: "Capital allocation (0–1)" },
  { name: "growth", label: "Growth (0–1)" },
  { name: "riskLevel", label: "Risk level (0–1, higher = riskier)" },
] as const;

export function GenerateRatingForm({ companyId }: { companyId: string }) {
  const boundAction = generateRatingAction.bind(null, companyId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SCORE_FIELDS.map((field) => (
          <div key={field.name}>
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type="number"
              min="0"
              max="1"
              step="0.05"
              required
              disabled={isPending}
              className={inputClasses}
            />
          </div>
        ))}
        <div>
          <label htmlFor="expectedReturn" className={labelClasses}>
            Expected return (e.g. 0.15 = 15%)
          </label>
          <input
            id="expectedReturn"
            name="expectedReturn"
            type="number"
            step="0.01"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="marginOfSafety" className={labelClasses}>
            Margin of safety achieved (e.g. 0.3 = 30%)
          </label>
          <input
            id="marginOfSafety"
            name="marginOfSafety"
            type="number"
            step="0.01"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className={errorTextClasses}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className={successTextClasses}>
          Rating generated.
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Generating…" : "Generate rating"}
      </button>
    </form>
  );
}
