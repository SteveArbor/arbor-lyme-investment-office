/**
 * A card that honestly represents "this module isn't built yet" rather
 * than showing placeholder/mock data. Used on the dashboard for
 * not-yet-implemented modules (Foundation brief: "No invented financial
 * data. No mock prices. No pretend portfolio performance.").
 */
export function EmptyStateCard({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-5 dark:border-neutral-700">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      <p className="mt-3 text-xs font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-600">
        {phase}
      </p>
    </div>
  );
}
