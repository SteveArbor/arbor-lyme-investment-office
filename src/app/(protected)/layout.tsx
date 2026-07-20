import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Disclaimer } from "@/components/layout/disclaimer";
import { SiteNav } from "@/components/layout/site-nav";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { signOutAction } from "../(auth)/actions";

/**
 * Defense-in-depth alongside src/proxy.ts: Supabase's current guidance is
 * not to rely on the proxy/middleware layer alone for protecting critical
 * routes, since matcher configuration can drift or be misconfigured. This
 * layout re-checks the session server-side for every request under
 * (protected).
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              aria-label="Arbor Lyme Capital — Dashboard"
              className="flex items-center transition-opacity hover:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see docs/brand-assets.md */}
              <img
                src="/brand/arbor-lyme-logo.svg"
                alt="Arbor Lyme Capital"
                width={845}
                height={502}
                className="h-8 w-auto sm:h-9"
              />
            </Link>
            <SiteNav />
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 focus:ring-2 focus:ring-neutral-500 focus:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-neutral-200 dark:border-neutral-800">
        <Disclaimer />
      </footer>
    </div>
  );
}
