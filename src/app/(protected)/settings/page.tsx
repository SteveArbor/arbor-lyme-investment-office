import type { Metadata } from "next";

import { composeAppServices } from "@/application/services";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Settings — Arbor Lyme Capital",
};

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Non-null: (protected)/layout.tsx redirects unauthenticated requests
  // before this page renders.
  const { settingsService } = composeAppServices(supabase);
  const settings = await settingsService.getSettings(user!.id);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Settings</h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Foundation settings. See docs/settings-engine.md for the full future scope.
      </p>
      <div className="mt-6">
        <SettingsForm settings={settings} />
      </div>
    </main>
  );
}
