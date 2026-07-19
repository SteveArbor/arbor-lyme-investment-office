"use client";

import { useActionState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
} from "@/components/ui/form-styles";

import { type ActionFormState, createPortfolioAction } from "./actions";

const initialState: ActionFormState = { error: null, success: false };

export function CreatePortfolioForm() {
  const [state, formAction, isPending] = useActionState(createPortfolioAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      <div>
        <label htmlFor="name" className={labelClasses}>
          Portfolio name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor="cash" className={labelClasses}>
          Starting cash
        </label>
        <input
          id="cash"
          name="cash"
          type="number"
          step="0.01"
          min="0"
          required
          disabled={isPending}
          className={inputClasses}
        />
      </div>

      {state.error ? (
        <p role="alert" className={errorTextClasses}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Creating…" : "Create portfolio"}
      </button>
    </form>
  );
}
