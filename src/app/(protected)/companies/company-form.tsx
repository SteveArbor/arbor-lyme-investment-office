"use client";

import { useActionState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
} from "@/components/ui/form-styles";

import { type CompanyFormState, createCompanyAction } from "./actions";

const initialState: CompanyFormState = { error: null };

export function CompanyForm() {
  const [state, formAction, isPending] = useActionState(createCompanyAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelClasses}>
            Company name
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
          <label htmlFor="ticker" className={labelClasses}>
            Ticker
          </label>
          <input
            id="ticker"
            name="ticker"
            type="text"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="exchange" className={labelClasses}>
            Exchange
          </label>
          <input
            id="exchange"
            name="exchange"
            type="text"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="currency" className={labelClasses}>
            Currency
          </label>
          <input
            id="currency"
            name="currency"
            type="text"
            maxLength={3}
            required
            defaultValue="USD"
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="sector" className={labelClasses}>
            Sector
          </label>
          <input
            id="sector"
            name="sector"
            type="text"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="industry" className={labelClasses}>
            Industry
          </label>
          <input
            id="industry"
            name="industry"
            type="text"
            required
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="securityType" className={labelClasses}>
            Security type
          </label>
          <select
            id="securityType"
            name="securityType"
            defaultValue="equity"
            disabled={isPending}
            className={inputClasses}
          >
            <option value="equity">Equity</option>
            <option value="etf">ETF</option>
            <option value="investment_trust">Investment trust</option>
            <option value="fund">Fund (OEIC / unit trust)</option>
          </select>
        </div>
        <div>
          <label htmlFor="status" className={labelClasses}>
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue="researching"
            disabled={isPending}
            className={inputClasses}
          >
            <option value="researching">Researching</option>
            <option value="monitoring">Monitoring</option>
            <option value="holding">Holding</option>
            <option value="passed">Passed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-neutral-900 dark:text-neutral-100">
            <input id="watchlist" name="watchlist" type="checkbox" disabled={isPending} />
            Add to watchlist
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="profile" className={labelClasses}>
          Profile
        </label>
        <textarea
          id="profile"
          name="profile"
          rows={3}
          disabled={isPending}
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="notes" className={labelClasses}>
          Notes
        </label>
        <textarea id="notes" name="notes" rows={3} disabled={isPending} className={inputClasses} />
      </div>

      {state.error ? (
        <p role="alert" className={errorTextClasses}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Adding…" : "Add company"}
      </button>
    </form>
  );
}
