/**
 * Required, unobtrusive disclaimer (Foundation brief §30). Placed in the
 * footer of every authenticated page via (protected)/layout.tsx — present
 * but not interruptive.
 */
export function Disclaimer() {
  return (
    <p className="mx-auto max-w-5xl px-4 py-6 text-xs text-neutral-500 dark:text-neutral-500">
      Arbor Lyme Capital is a private decision support tool. It does not provide regulated financial
      advice and does not execute trades.
    </p>
  );
}
