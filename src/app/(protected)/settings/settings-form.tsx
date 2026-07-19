"use client";

import { useActionState } from "react";

import type { Settings } from "@/domain/settings";

import { updateSettingsAction, type UpdateSettingsFormState } from "./actions";

const initialState: UpdateSettingsFormState = { error: null, success: false };

const labelClasses = "block text-sm font-medium text-neutral-900 dark:text-neutral-100";
const inputClasses =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, isPending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-6">
      <div>
        <label htmlFor="baseCurrency" className={labelClasses}>
          Base currency
        </label>
        <select
          id="baseCurrency"
          name="baseCurrency"
          defaultValue={settings.baseCurrency}
          disabled={isPending}
          className={inputClasses}
        >
          <option value="GBP">GBP — British Pound</option>
          <option value="USD">USD — US Dollar</option>
          <option value="EUR">EUR — Euro</option>
        </select>
      </div>

      <div>
        <label htmlFor="timeZone" className={labelClasses}>
          Time zone
        </label>
        <input
          id="timeZone"
          name="timeZone"
          type="text"
          defaultValue={settings.timeZone}
          disabled={isPending}
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="appearance" className={labelClasses}>
          Appearance
        </label>
        <select
          id="appearance"
          name="appearance"
          defaultValue={settings.appearance}
          disabled={isPending}
          className={inputClasses}
        >
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div>
        <label htmlFor="monthlyIncomeTarget" className={labelClasses}>
          Monthly income target (£)
        </label>
        <input
          id="monthlyIncomeTarget"
          name="monthlyIncomeTarget"
          type="number"
          min="0"
          step="0.01"
          defaultValue={settings.monthlyIncomeTarget}
          disabled={isPending}
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="secondaryMonthlyIncomeTarget" className={labelClasses}>
          Secondary monthly income target (£)
        </label>
        <input
          id="secondaryMonthlyIncomeTarget"
          name="secondaryMonthlyIncomeTarget"
          type="number"
          min="0"
          step="0.01"
          defaultValue={settings.secondaryMonthlyIncomeTarget}
          disabled={isPending}
          className={inputClasses}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Settings updated.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {isPending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
