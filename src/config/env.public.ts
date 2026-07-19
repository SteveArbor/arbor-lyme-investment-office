import { z } from "zod";

/**
 * Public, browser-safe environment configuration. These values are inlined
 * into the client bundle at build time by Next.js (any `NEXT_PUBLIC_*`
 * variable) — nothing in this file may ever be a secret. Server-only
 * variables live in `env.server.ts`, which is guarded so it cannot be
 * imported from client code (see docs/security-principles.md).
 *
 * Validation is lazy (on first call to getPublicEnv(), not at module
 * import time) and memoized after that. This is deliberate, not an
 * oversight: Next.js's build step imports route modules to collect their
 * configuration even for routes that are dynamically rendered at request
 * time — an eager top-level validation throws during that import step and
 * breaks `next build` even when no request that actually needs Supabase
 * is being served, which would make a production build depend on real
 * credentials being present (contrary to this milestone's explicit
 * requirement that ordinary quality checks, including the build, must not
 * require them). Lazy validation still fails fast and clearly — just at
 * the point something genuinely tries to use the value, not at import time.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedPublicEnv: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    // Deliberately name only which variables are missing/invalid — never
    // echo submitted values (there are none here, but this stays the
    // pattern even as more variables are added later).
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(
      `Invalid or missing public environment variables: ${missing}. ` +
        "Check .env.local against .env.example."
    );
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}
