"use client";

import { useActionState, useState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
  successTextClasses,
} from "@/components/ui/form-styles";
import type { Company } from "@/domain/company";

import {
  type ActionFormState,
  recordBuyAction,
  recordCashAdjustmentAction,
  recordDividendAction,
  recordSellAction,
} from "./actions";

const initialState: ActionFormState = { error: null, success: false };

const TABS = ["buy", "sell", "dividend", "cash_adjustment"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  cash_adjustment: "Cash adjustment",
};

function CompanySelect({ companies, disabled }: { companies: Company[]; disabled: boolean }) {
  return (
    <div>
      <label htmlFor="companyId" className={labelClasses}>
        Company
      </label>
      <select id="companyId" name="companyId" required disabled={disabled} className={inputClasses}>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name} ({company.ticker})
          </option>
        ))}
      </select>
    </div>
  );
}

function BuySellFields({ disabled }: { disabled: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="quantity" className={labelClasses}>
          Quantity
        </label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          step="0.000001"
          min="0.000001"
          required
          disabled={disabled}
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor="pricePerUnit" className={labelClasses}>
          Price per unit
        </label>
        <input
          id="pricePerUnit"
          name="pricePerUnit"
          type="number"
          step="0.000001"
          min="0.000001"
          required
          disabled={disabled}
          className={inputClasses}
        />
      </div>
    </div>
  );
}

function OccurredAtNotesFields({ disabled }: { disabled: boolean }) {
  return (
    <>
      <div>
        <label htmlFor="occurredAt" className={labelClasses}>
          Date
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          disabled={disabled}
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor="notes" className={labelClasses}>
          Notes
        </label>
        <input id="notes" name="notes" type="text" disabled={disabled} className={inputClasses} />
      </div>
    </>
  );
}

function FormStatus({ state }: { state: ActionFormState }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className={errorTextClasses}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className={successTextClasses}>
          Transaction recorded.
        </p>
      ) : null}
    </>
  );
}

function BuyForm({ portfolioId, companies }: { portfolioId: string; companies: Company[] }) {
  const [state, formAction, isPending] = useActionState(
    recordBuyAction.bind(null, portfolioId),
    initialState
  );
  return (
    <form action={formAction} noValidate className="space-y-4">
      <CompanySelect companies={companies} disabled={isPending} />
      <BuySellFields disabled={isPending} />
      <OccurredAtNotesFields disabled={isPending} />
      <FormStatus state={state} />
      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Recording…" : "Record buy"}
      </button>
    </form>
  );
}

function SellForm({ portfolioId, companies }: { portfolioId: string; companies: Company[] }) {
  const [state, formAction, isPending] = useActionState(
    recordSellAction.bind(null, portfolioId),
    initialState
  );
  return (
    <form action={formAction} noValidate className="space-y-4">
      <CompanySelect companies={companies} disabled={isPending} />
      <BuySellFields disabled={isPending} />
      <OccurredAtNotesFields disabled={isPending} />
      <FormStatus state={state} />
      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Recording…" : "Record sell"}
      </button>
    </form>
  );
}

function DividendForm({ portfolioId, companies }: { portfolioId: string; companies: Company[] }) {
  const [state, formAction, isPending] = useActionState(
    recordDividendAction.bind(null, portfolioId),
    initialState
  );
  return (
    <form action={formAction} noValidate className="space-y-4">
      <CompanySelect companies={companies} disabled={isPending} />
      <div>
        <label htmlFor="amount" className={labelClasses}>
          Amount
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <OccurredAtNotesFields disabled={isPending} />
      <FormStatus state={state} />
      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Recording…" : "Record dividend"}
      </button>
    </form>
  );
}

function CashAdjustmentForm({ portfolioId }: { portfolioId: string }) {
  const [state, formAction, isPending] = useActionState(
    recordCashAdjustmentAction.bind(null, portfolioId),
    initialState
  );
  return (
    <form action={formAction} noValidate className="space-y-4">
      <div>
        <label htmlFor="amount" className={labelClasses}>
          Amount (negative for a withdrawal)
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          required
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <OccurredAtNotesFields disabled={isPending} />
      <FormStatus state={state} />
      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Recording…" : "Record adjustment"}
      </button>
    </form>
  );
}

export function TransactionForms({
  portfolioId,
  companies,
}: {
  portfolioId: string;
  companies: Company[];
}) {
  const [tab, setTab] = useState<Tab>("buy");

  return (
    <div>
      <div className="flex gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-800">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus:ring-2 focus:ring-neutral-500 focus:outline-none ${
              tab === item
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            {TAB_LABELS[item]}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {companies.length === 0 && tab !== "cash_adjustment" ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Add a company first before recording {TAB_LABELS[tab].toLowerCase()} transactions.
          </p>
        ) : (
          <>
            {tab === "buy" ? <BuyForm portfolioId={portfolioId} companies={companies} /> : null}
            {tab === "sell" ? <SellForm portfolioId={portfolioId} companies={companies} /> : null}
            {tab === "dividend" ? (
              <DividendForm portfolioId={portfolioId} companies={companies} />
            ) : null}
            {tab === "cash_adjustment" ? <CashAdjustmentForm portfolioId={portfolioId} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
