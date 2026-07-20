"use client";

import Link from "next/link";
import { useEffect } from "react";

import { primaryButtonClasses, secondaryButtonClasses } from "@/components/ui/form-styles";
import { logger } from "@/lib/logger";

/**
 * A route-segment error boundary nested inside (protected), not just the
 * root src/app/error.tsx. Next.js positions an error.tsx's boundary around
 * its segment's page content, not its sibling layout.tsx -- so
 * (protected)/layout.tsx's header/nav/sign-out (and the Disclaimer footer)
 * keep rendering normally around this fallback, instead of a page-level
 * error taking out the entire chrome and leaving only the browser back
 * button as a way out (docs/implementation/production-readiness.md).
 */
export default function ProtectedError({
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
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        Something went wrong
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">
        An unexpected error occurred loading this page. No changes were made without your
        confirmation.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className={primaryButtonClasses}>
          Try again
        </button>
        <Link href="/dashboard" className={secondaryButtonClasses}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
