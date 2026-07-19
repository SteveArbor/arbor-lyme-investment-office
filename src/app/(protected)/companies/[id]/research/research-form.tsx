"use client";

import { useActionState } from "react";

import {
  errorTextClasses,
  labelClasses,
  primaryButtonClasses,
  successTextClasses,
  textareaClasses,
} from "@/components/ui/form-styles";
import type { ResearchNote } from "@/domain/research";

import { type ActionFormState, updateResearchAction } from "./actions";

const initialState: ActionFormState = { error: null, success: false };

const SECTIONS: { name: keyof ResearchNote; label: string }[] = [
  { name: "businessOverview", label: "Business overview" },
  { name: "investmentThesis", label: "Investment thesis" },
  { name: "economicMoat", label: "Economic moat" },
  { name: "management", label: "Management" },
  { name: "financialStrength", label: "Financial strength" },
  { name: "capitalAllocation", label: "Capital allocation" },
  { name: "growthDrivers", label: "Growth drivers" },
  { name: "risks", label: "Risks" },
  { name: "monitoringMetrics", label: "Monitoring metrics" },
  { name: "notes", label: "Notes" },
];

export function ResearchForm({
  companyId,
  research,
}: {
  companyId: string;
  research: ResearchNote;
}) {
  const boundAction = updateResearchAction.bind(null, companyId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-6">
      {SECTIONS.map((section) => (
        <div key={section.name}>
          <label htmlFor={section.name} className={labelClasses}>
            {section.label}
          </label>
          <textarea
            id={section.name}
            name={section.name}
            rows={4}
            defaultValue={(research[section.name] as string | null) ?? ""}
            disabled={isPending}
            className={textareaClasses}
          />
        </div>
      ))}

      {state.error ? (
        <p role="alert" className={errorTextClasses}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className={successTextClasses}>
          Research saved. Previous version preserved in history.
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Saving…" : "Save research"}
      </button>
    </form>
  );
}
