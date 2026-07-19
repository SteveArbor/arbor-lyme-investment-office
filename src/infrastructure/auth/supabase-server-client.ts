import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/config/env.public";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase client for use in Server Components, Server
 * Actions, and Route Handlers. Uses the anon key + the caller's session
 * cookie — RLS scopes every query to the authenticated user
 * (docs/security-principles.md). This is deliberately not a service-role
 * client: Foundation has no code path that genuinely needs to bypass RLS
 * (docs/implementation/foundation.md explains why — profile creation uses
 * a database trigger, not a privileged client).
 *
 * `cookies()` is async as of Next.js 15+ and must be awaited
 * (https://nextjs.org/docs/app/api-reference/functions/cookies).
 *
 * Server Components cannot write cookies (Next.js restriction) — the
 * try/catch below absorbs that specific, expected case. src/proxy.ts is
 * what actually refreshes the session cookie on every request; this
 * client's `setAll` is only exercised from Server Actions/Route Handlers,
 * where writing cookies is permitted.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component, where cookie writes are not
            // permitted. Safe to ignore: middleware refreshes the session
            // on the next request regardless.
          }
        },
      },
    }
  );
}
