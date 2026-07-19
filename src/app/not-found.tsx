import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found — Arbor Lyme Capital",
};

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-svh flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
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
