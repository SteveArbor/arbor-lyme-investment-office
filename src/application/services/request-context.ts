import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/infrastructure/auth";

import { composeAppServices } from "./compose";

export interface RequestContext {
  user: User;
  services: ReturnType<typeof composeAppServices>;
}

/**
 * The four lines every protected-route Server Action needs before doing
 * anything else — create the Supabase client, resolve the current user,
 * and compose the domain services — collapsed into one call. Returns
 * `null` when there is no authenticated session, so a caller's own
 * "you must be signed in" error shape stays under its control rather than
 * this helper imposing one (Phase 2 Architecture Review finding 4.8:
 * this exact sequence was previously repeated, with minor variations,
 * across nine Server Action files).
 *
 * (auth)/actions.ts deliberately does not use this: signInAction has no
 * user yet by definition, and signOutAction's not-signed-in path is a
 * no-op, not an error — both are genuinely different shapes than the
 * "reject if signed out" pattern this helper exists for.
 */
export async function getRequestContext(): Promise<RequestContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return { user, services: composeAppServices(supabase) };
}
