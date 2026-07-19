import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/config/env.public";
import type { Database } from "@/types/database";

/**
 * Browser-side Supabase client. Uses the anon key only — Row-Level Security
 * is what enforces access control (docs/security-principles.md), not
 * secrecy of this key. Never construct a service-role client here; the
 * service role must never reach the browser (docs/threat-model.md §9).
 */
export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
