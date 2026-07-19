"use client";

/**
 * Catches an error thrown by the root layout itself — a stricter, rarer
 * case than error.tsx, which is why Next.js requires this file to render
 * its own <html>/<body> (the root layout that would normally provide them
 * is exactly what failed). Kept deliberately minimal and dependency-free.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-GB">
      <body>
        <main className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
          <h1 className="text-xl font-semibold text-neutral-900">Something went wrong</h1>
          <p className="mt-2 max-w-sm text-sm text-neutral-600">
            Arbor Lyme Capital could not load. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
