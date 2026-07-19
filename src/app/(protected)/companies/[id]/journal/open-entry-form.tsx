"use client";

import { useActionState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
  successTextClasses,
} from "@/components/ui/form-styles";
import type { Portfolio } from "@/domain/portfolio";

import { type ActionFormState, openJournalEntryAction } from "./actions";

const initialState: ActionFormState = { error: null, success: false };

export function OpenEntryForm({
  companyId,
  portfolios,
}: {
  companyId: string;
  portfolios: Portfolio[];
}) {
  const boundAction = openJournalEntryAction.bind(null, companyId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="portfolioId" className={labelClasses}>
            Portfolio
          </label>
          <select
            id="portfolioId"
            name="portfolioId"
            required
            disabled={isPending}
            className={inputClasses}
          >
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="purchaseDate" className={labelClasses}>
            Purchase date
          </label>
          <input
            id="purchaseDate"
            name="purchaseDate"
            type="date"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="purchasePrice" className={labelClasses}>
            Purchase price
          </label>
          <input
            id="purchasePrice"
            name="purchasePrice"
            type="number"
            step="0.01"
            min="0.01"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="fairValueAtPurchase" className={labelClasses}>
            Fair value at purchase
          </label>
          <input
            id="fairValueAtPurchase"
            name="fairValueAtPurchase"
            type="number"
            step="0.01"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="expectedReturnAtPurchase" className={labelClasses}>
            Expected return
          </label>
          <input
            id="expectedReturnAtPurchase"
            name="expectedReturnAtPurchase"
            type="number"
            step="0.01"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="positionSize" className={labelClasses}>
            Position size
          </label>
          <input
            id="positionSize"
            name="positionSize"
            type="number"
            step="0.01"
            min="0.01"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="convictionAtPurchase" className={labelClasses}>
            Conviction (0–1)
          </label>
          <input
            id="convictionAtPurchase"
            name="convictionAtPurchase"
            type="number"
            step="0.05"
            min="0"
            max="1"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
      </div>

      <div>
        <label htmlFor="thesisSummary" className={labelClasses}>
          Thesis summary
        </label>
        <textarea
          id="thesisSummary"
          name="thesisSummary"
          rows={3}
          required
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor="risks" className={labelClasses}>
          Risks
        </label>
        <textarea id="risks" name="risks" rows={2} disabled={isPending} className={inputClasses} />
      </div>
      <div>
        <label htmlFor="invalidationConditions" className={labelClasses}>
          Invalidation conditions
        </label>
        <textarea
          id="invalidationConditions"
          name="invalidationConditions"
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
          Journal entry opened.
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Saving…" : "Open entry"}
      </button>
    </form>
  );
}
