"use client";

import { useActionState, useState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  successTextClasses,
} from "@/components/ui/form-styles";
import type { ThesisStatement, ThesisStatementInput } from "@/domain/thesis";

import { type ActionFormState, updateThesisAction } from "./actions";

const initialState: ActionFormState = { error: null, success: false };

const EMPTY_STATEMENT: ThesisStatementInput = {
  description: "",
  confidence: 0.5,
  status: "stable",
};

export function ThesisForm({
  companyId,
  statements,
}: {
  companyId: string;
  statements: ThesisStatement[];
}) {
  const [rows, setRows] = useState<ThesisStatementInput[]>(
    statements.length > 0 ? statements : [EMPTY_STATEMENT]
  );
  const boundAction = updateThesisAction.bind(null, companyId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  function updateRow(index: number, patch: Partial<ThesisStatementInput>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <form action={formAction} noValidate className="space-y-6">
      <input type="hidden" name="statements" value={JSON.stringify(rows)} />

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div
            key={index}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div>
              <label htmlFor={`description-${index}`} className={labelClasses}>
                Statement
              </label>
              <textarea
                id={`description-${index}`}
                rows={2}
                value={row.description}
                onChange={(event) => updateRow(index, { description: event.target.value })}
                disabled={isPending}
                className={inputClasses}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={`confidence-${index}`} className={labelClasses}>
                  Confidence (0–1)
                </label>
                <input
                  id={`confidence-${index}`}
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={row.confidence}
                  onChange={(event) => updateRow(index, { confidence: Number(event.target.value) })}
                  disabled={isPending}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor={`status-${index}`} className={labelClasses}>
                  Status
                </label>
                <select
                  id={`status-${index}`}
                  value={row.status}
                  onChange={(event) =>
                    updateRow(index, {
                      status: event.target.value as ThesisStatementInput["status"],
                    })
                  }
                  disabled={isPending}
                  className={inputClasses}
                >
                  <option value="strengthening">Strengthening</option>
                  <option value="stable">Stable</option>
                  <option value="weakening">Weakening</option>
                  <option value="broken">Broken</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              disabled={isPending || rows.length === 1}
              className="mt-3 text-sm text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
            >
              Remove statement
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((current) => [...current, { ...EMPTY_STATEMENT }])}
        disabled={isPending}
        className={secondaryButtonClasses}
      >
        Add statement
      </button>

      {state.error ? (
        <p role="alert" className={errorTextClasses}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className={successTextClasses}>
          Thesis saved. Overall status recalculated.
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={isPending} className={primaryButtonClasses}>
          {isPending ? "Saving…" : "Save thesis"}
        </button>
      </div>
    </form>
  );
}
