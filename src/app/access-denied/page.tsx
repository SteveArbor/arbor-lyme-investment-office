import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Access denied — Arbor Lyme Capital",
};

/**
 * Generic "you can't be here" screen. Not yet linked to from anywhere in
 * Foundation — there is no role or feature-flag gate in this milestone
 * that would route here (the single user has access to everything
 * Foundation builds). It exists now so future gates (multi-user roles,
 * per docs/architecture.md; disabled-feature-flag routes, per
 * docs/feature-flags.md) have a page to redirect to from their first
 * implementation, rather than inventing one under deadline pressure later.
 */
export default function AccessDeniedPage() {
  return (
    <main
      id="main-content"
      className="flex min-h-svh flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        Access denied
      </h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">
        You don&apos;t have permission to view this page.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:outline-none dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Go to dashboard
      </Link>
    </main>
  );
}
