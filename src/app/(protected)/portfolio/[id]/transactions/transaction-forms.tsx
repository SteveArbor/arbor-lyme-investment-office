"use client";

import { useActionState, useMemo, useState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
  successTextClasses,
} from "@/components/ui/form-styles";
import type { Company } from "@/domain/company";
import type { CashAdjustmentCategory } from "@/domain/trading";
import { CASH_ADJUSTMENT_CATEGORY_OPTIONS } from "@/domain/trading";
import { formatCurrency } from "@/lib/format";

import {
  type ActionFormState,
  recordBuyAction,
  recordCashAdjustmentAction,
  recordDividendAction,
  recordFeeAction,
  recordInterestAction,
  recordSellAction,
  recordTaxAction,
} from "./actions";

const initialState: ActionFormState = { error: null, success: false };

const TABS = ["buy", "sell", "dividend", "fee", "interest", "tax", "cash_adjustment"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  fee: "Fee",
  interest: "Interest",
  tax: "Tax",
  cash_adjustment: "Cash adjustment",
};

const CASH_ADJUSTMENT_CATEGORY_LABELS: Record<CashAdjustmentCategory, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  correction: "Correction",
  other: "Other",
};

function CompanySelect({
  companies,
  disabled,
  required = true,
  label = "Company",
}: {
  companies: Company[];
  disabled: boolean;
  required?: boolean;
  label?: string;
}) {
  return (
    <div>
      <label htmlFor="companyId" className={labelClasses}>
        {label}
        {!required ? <span className="font-normal text-neutral-500"> (optional)</span> : null}
      </label>
      <select
        id="companyId"
        name="companyId"
        required={required}
        disabled={disabled}
        defaultValue=""
        className={inputClasses}
      >
        {!required ? <option value="">— None (portfolio level) —</option> : null}
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

function ReferenceField({ disabled }: { disabled: boolean }) {
  return (
    <div>
      <label htmlFor="reference" className={labelClasses}>
        External reference <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <input
        id="reference"
        name="reference"
        type="text"
        placeholder="e.g. bank reference, broker contract note"
        disabled={disabled}
        className={inputClasses}
      />
    </div>
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

/**
 * Every cash-affecting form must show current balance, the adjustment, and
 * the resulting balance before the user confirms (Milestone 2.7 Part 1,
 * Cash Management). The database is still the authority that actually
 * computes and enforces the resulting balance
 * (supabase/migrations/20260720000001_cash_management_and_performance.sql)
 * — this is a client-side preview only, reproducing that same arithmetic
 * for the user to review before submitting.
 */
function CashPreview({
  currentCash,
  currency,
  delta,
}: {
  currentCash: number;
  currency: string;
  delta: number;
}) {
  const resulting = currentCash + delta;
  const willOverdraw = resulting < 0;
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <span className="text-neutral-600 dark:text-neutral-400">Current balance</span>
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {formatCurrency(currentCash, currency)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-neutral-600 dark:text-neutral-400">Adjustment</span>
        <span
          className={`font-medium ${delta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
        >
          {delta >= 0 ? "+" : ""}
          {formatCurrency(delta, currency)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-1 dark:border-neutral-800">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          Resulting balance
        </span>
        <span
          className={`font-semibold ${willOverdraw ? "text-red-700 dark:text-red-400" : "text-neutral-900 dark:text-neutral-100"}`}
        >
          {formatCurrency(resulting, currency)}
        </span>
      </div>
      {willOverdraw ? (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">
          This would make the portfolio balance negative and will be rejected.
        </p>
      ) : null}
    </div>
  );
}

function useAmountState() {
  const [amount, setAmount] = useState<number>(0);
  return {
    amount,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(event.target.value);
      setAmount(Number.isFinite(parsed) ? parsed : 0);
    },
  };
}

function AmountField({
  disabled,
  onChange,
  label = "Amount",
  min = "0.01",
}: {
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  min?: string;
}) {
  return (
    <div>
      <label htmlFor="amount" className={labelClasses}>
        {label}
      </label>
      <input
        id="amount"
        name="amount"
        type="number"
        step="0.01"
        min={min}
        required
        disabled={disabled}
        onChange={onChange}
        className={inputClasses}
      />
    </div>
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

function DividendForm({
  portfolioId,
  companies,
  currentCash,
  currency,
}: {
  portfolioId: string;
  companies: Company[];
  currentCash: number;
  currency: string;
}) {
  const [state, formAction, isPending] = useActionState(
    recordDividendAction.bind(null, portfolioId),
    initialState
  );
  const { amount, onChange } = useAmountState();
  return (
    <form action={formAction} noValidate className="space-y-4">
      <CompanySelect companies={companies} disabled={isPending} />
      <AmountField disabled={isPending} onChange={onChange} />
      <OccurredAtNotesFields disabled={isPending} />
      <ReferenceField disabled={isPending} />
      <CashPreview currentCash={currentCash} currency={currency} delta={amount} />
      <FormStatus state={state} />
      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Recording…" : "Record dividend"}
      </button>
    </form>
  );
}

function FeeForm({
  portfolioId,
  companies,
  currentCash,
  currency,
}: {
  portfolioId: string;
  companies: Company[];
  currentCash: number;
  currency: string;
}) {
  const [state, formAction, isPending] = useActionState(
    recordFeeAction.bind(null, portfolioId),
    initialState
  );
  const { amount, onChange } = useAmountState();
  return (
    <form action={formAction} noValidate className="space-y-4">
      <CompanySelect
        companies={companies}
        disabled={isPending}
        required={false}
        label="Related company"
      />
      <AmountField disabled={isPending} onChange={onChange} />
      <OccurredAtNotesFields disabled={isPending} />
      <ReferenceField disabled={isPending} />
      <CashPreview currentCash={currentCash} currency={currency} delta={-amount} />
      <FormStatus state={state} />
      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Recording…" : "Record fee"}
      </button>
    </form>
  );
}

function InterestForm({
  portfolioId,
  currentCash,
  currency,
}: {
  portfolioId: string;
  currentCash: number;
  currency: string;
}) {
  const [state, formAction, isPending] = useActionState(
    recordInterestAction.bind(null, portfolioId),
    initialState
  );
  const { amount, onChange } = useAmountState();
  return (
    <form action={formAction} noValidate className="space-y-4">
      <AmountField disabled={isPending} onChange={onChange} />
      <OccurredAtNotesFields disabled={isPending} />
      <ReferenceField disabled={isPending} />
      <CashPreview currentCash={currentCash} currency={currency} delta={amount} />
      <FormStatus state={state} />
      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Recording…" : "Record interest"}
      </button>
    </form>
  );
}

function TaxForm({
  portfolioId,
  companies,
  currentCash,
  currency,
}: {
  portfolioId: string;
  companies: Company[];
  currentCash: number;
  currency: string;
}) {
  const [state, formAction, isPending] = useActionState(
    recordTaxAction.bind(null, portfolioId),
    initialState
  );
  const { amount, onChange } = useAmountState();
  return (
    <form action={formAction} noValidate className="space-y-4">
      <CompanySelect
        companies={companies}
        disabled={isPending}
        required={false}
        label="Related company"
      />
      <AmountField disabled={isPending} onChange={onChange} />
      <OccurredAtNotesFields disabled={isPending} />
      <ReferenceField disabled={isPending} />
      <CashPreview currentCash={currentCash} currency={currency} delta={-amount} />
      <FormStatus state={state} />
      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Recording…" : "Record tax"}
      </button>
    </form>
  );
}

function CashAdjustmentForm({
  portfolioId,
  currentCash,
  currency,
}: {
  portfolioId: string;
  currentCash: number;
  currency: string;
}) {
  const [state, formAction, isPending] = useActionState(
    recordCashAdjustmentAction.bind(null, portfolioId),
    initialState
  );
  const [category, setCategory] = useState<CashAdjustmentCategory>("deposit");
  const [amount, setAmount] = useState<number>(0);

  const isSignedEntry = category === "correction" || category === "other";
  const delta = useMemo(() => {
    if (category === "deposit") return amount;
    if (category === "withdrawal") return -amount;
    return amount; // correction/other: the amount the user types IS the signed delta
  }, [category, amount]);

  return (
    <form action={formAction} noValidate className="space-y-4">
      <div>
        <label htmlFor="category" className={labelClasses}>
          Type
        </label>
        <select
          id="category"
          name="category"
          required
          disabled={isPending}
          value={category}
          onChange={(event) => setCategory(event.target.value as CashAdjustmentCategory)}
          className={inputClasses}
        >
          {CASH_ADJUSTMENT_CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {CASH_ADJUSTMENT_CATEGORY_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
      <AmountField
        disabled={isPending}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          setAmount(Number.isFinite(parsed) ? parsed : 0);
        }}
        label={isSignedEntry ? "Amount (negative to decrease the balance)" : "Amount"}
        min={isSignedEntry ? undefined : "0.01"}
      />
      <OccurredAtNotesFields disabled={isPending} />
      <ReferenceField disabled={isPending} />
      <CashPreview currentCash={currentCash} currency={currency} delta={delta} />
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
  currentCash,
  currency,
}: {
  portfolioId: string;
  companies: Company[];
  currentCash: number;
  currency: string;
}) {
  const [tab, setTab] = useState<Tab>("buy");
  const requiresCompany = tab === "buy" || tab === "sell" || tab === "dividend";

  return (
    <div>
      <div
        role="tablist"
        aria-label="Transaction type"
        className="flex flex-wrap gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-800"
      >
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
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
        {companies.length === 0 && requiresCompany ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Add a company first before recording {TAB_LABELS[tab].toLowerCase()} transactions.
          </p>
        ) : (
          <>
            {tab === "buy" ? <BuyForm portfolioId={portfolioId} companies={companies} /> : null}
            {tab === "sell" ? <SellForm portfolioId={portfolioId} companies={companies} /> : null}
            {tab === "dividend" ? (
              <DividendForm
                portfolioId={portfolioId}
                companies={companies}
                currentCash={currentCash}
                currency={currency}
              />
            ) : null}
            {tab === "fee" ? (
              <FeeForm
                portfolioId={portfolioId}
                companies={companies}
                currentCash={currentCash}
                currency={currency}
              />
            ) : null}
            {tab === "interest" ? (
              <InterestForm
                portfolioId={portfolioId}
                currentCash={currentCash}
                currency={currency}
              />
            ) : null}
            {tab === "tax" ? (
              <TaxForm
                portfolioId={portfolioId}
                companies={companies}
                currentCash={currentCash}
                currency={currency}
              />
            ) : null}
            {tab === "cash_adjustment" ? (
              <CashAdjustmentForm
                portfolioId={portfolioId}
                currentCash={currentCash}
                currency={currency}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
