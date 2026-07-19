"use client";

import { useActionState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
  successTextClasses,
} from "@/components/ui/form-styles";

import { type ActionFormState, closeJournalEntryAction } from "./actions";

const initialState: ActionFormState = { error: null, success: false };

export function CloseEntryForm({ companyId, entryId }: { companyId: string; entryId: string }) {
  const boundAction = closeJournalEntryAction.bind(null, companyId, entryId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="saleDate" className={labelClasses}>
            Sale date
          </label>
          <input
            id="saleDate"
            name="saleDate"
            type="date"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="saleReason" className={labelClasses}>
            Sale reason
          </label>
          <input
            id="saleReason"
            name="saleReason"
            type="text"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
      </div>
      <div>
        <label htmlFor="lessonsLearned" className={labelClasses}>
          Lessons learned
        </label>
        <textarea
          id="lessonsLearned"
          name="lessonsLearned"
          rows={2}
          disabled={isPending}
          className={inputClasses}
        />
      </div>

      {state.error ? (
        <p role="alert" className={errorTextClasses}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className={successTextClasses}>
          Entry closed.
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Saving…" : "Close entry"}
      </button>
    </form>
  );
}
