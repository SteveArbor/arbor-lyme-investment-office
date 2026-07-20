"use client";

import Link from "next/link";
import { useEffect } from "react";

import { logger } from "@/lib/logger";

/**
 * Route-level error boundary (Next.js App Router convention). Catches
 * rendering errors within a route segment without taking down the whole
 * application — see docs/implementation/foundation.md for what this
 * covers vs. global-error.tsx (which catches failures in the root layout
 * itself, a stricter, rarer case).
 *
 * Never surfaces the raw error message to the user (it may contain
 * internal detail) — a generic message is shown; the real error is logged
 * server/client-side via the structured logger.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled error boundary triggered", {
      category: "error-boundary",
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex min-h-svh flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">
        An unexpected error occurred. No changes were made without your confirmation.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:outline-none dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:outline-none dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          Start over
        </Link>
      </div>
    </main>
  );
}
