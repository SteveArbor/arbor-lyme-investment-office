/**
 * Shared display formatting for money, percentages, and dates — extracted
 * in Milestone 2.7 once Cash Management, Holdings, Performance, and
 * Transactions views all needed the same currency/percent conventions
 * (previously each page hand-rolled `.toFixed(2)`, losing thousands
 * separators and any currency symbol).
 */

export function formatCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

/** Same as formatCurrency but always shows a leading sign (+/-). */
export function formatSignedCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    signDisplay: "always",
  }).format(amount);
}

export function formatPercent(fraction: number, fractionDigits = 1): string {
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: "never",
  }).format(fraction);
}

export function formatSignedPercent(fraction: number, fractionDigits = 1): string {
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: "always",
  }).format(fraction);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Tailwind text-color classes for a gain/loss value — green when >= 0, red when negative. */
export function gainLossClasses(value: number): string {
  return value >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";
}
