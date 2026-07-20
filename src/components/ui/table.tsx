/**
 * Shared table primitives (Milestone 2.7 Part 2 "Table component
 * overhaul") — every data table in the app (Companies, Dashboard watchlist,
 * Transactions, Holdings) had hand-copied the same header/row/cell classes
 * independently; centralising them here is what makes "consistent
 * alignment" and "better typography" true across pages rather than an
 * aspiration that drifts the next time only one of them is edited.
 */
export const tableContainerClasses =
  "overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800";

export const tableClasses = "w-full min-w-max text-left text-sm";

export const tableHeadClasses =
  "border-b border-neutral-200 bg-neutral-50 text-xs font-medium tracking-wide text-neutral-600 uppercase dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400";

export const tableBodyClasses = "divide-y divide-neutral-200 dark:divide-neutral-800";

/** Apply to a `<tr>` whose cells are individually wrapped in a `<Link>` — see docs comment on ClickableRow below. */
export const clickableRowClasses =
  "cursor-pointer transition hover:bg-neutral-50 dark:hover:bg-neutral-900";

export const tableCellClasses = "px-4 py-3";

/**
 * A table cell whose entire clickable area is a `<Link>`, not the `<tr>`
 * itself — `<tr onClick>` breaks keyboard navigation, middle-click/open-in-
 * new-tab, and screen reader row semantics, none of which an app managing
 * real financial positions should sacrifice for a marginally simpler
 * click handler. `block` makes the link fill the cell's full padding box
 * so the whole cell (not just the text) is part of the click target.
 */
export const clickableCellLinkClasses = "block px-4 py-3";

export function TableEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
    </div>
  );
}
