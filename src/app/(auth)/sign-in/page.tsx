import type { Metadata } from "next";

import { Disclaimer } from "@/components/layout/disclaimer";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Arbor Lyme Capital",
};

export default function SignInPage() {
  return (
    <main id="main-content" className="flex min-h-svh flex-col px-4">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- deliberately not next/image: the source SVG wraps a raster image, and Next's image optimizer re-encodes assets, which would alter the supplied brand artwork (docs/brand-assets.md). */}
            <img
              src="/brand/arbor-lyme-logo.svg"
              alt="Arbor Lyme Capital"
              width={845}
              height={502}
              className="mx-auto h-12 w-auto"
            />
            <h1 className="mt-4 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Sign in
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Investment Office</p>
          </div>
          <SignInForm />
        </div>
      </div>
      <Disclaimer />
    </main>
  );
}
