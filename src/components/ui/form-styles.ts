/**
 * Shared form control classes for Phase 2 screens — extracted once
 * Research/Thesis/Valuation/Decision/Portfolio/Trading/Journal forms all
 * needed the same styling that settings-form.tsx originated (no
 * duplicated logic across ~10 forms).
 */
export const labelClasses = "block text-sm font-medium text-neutral-900 dark:text-neutral-100";

export const inputClasses =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export const textareaClasses = `${inputClasses} font-mono`;

export const primaryButtonClasses =
  "rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";

export const secondaryButtonClasses =
  "rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800";

export const errorTextClasses = "text-sm text-red-700 dark:text-red-400";
export const successTextClasses = "text-sm text-green-700 dark:text-green-400";

export const cardClasses =
  "rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";
