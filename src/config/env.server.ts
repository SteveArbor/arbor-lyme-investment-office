import "server-only";

import { z } from "zod";

/**
 * Server-only environment configuration. The `server-only` import above
 * makes it a build-time error to import this module from a Client
 * Component, so a server secret can never end up in the browser bundle
 * (docs/security-principles.md, docs/threat-model.md §9).
 *
 * The Foundation milestone has no server-only secrets to validate yet:
 * there is no service-role client (profile creation uses a database
 * trigger, not a privileged client — see docs/implementation/foundation.md)
 * and no cron route (CRON_SECRET is unused until a scheduled job exists,
 * per docs/development-roadmap.md). This file is structured now so future
 * server-only variables (SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, AI
 * provider keys, etc.) are added to one place, validated the same way as
 * the public schema, rather than read ad hoc from `process.env` at each
 * call site.
 *
 * Validation is lazy (on first call to getServerEnv()) for the same reason
 * as env.public.ts: it must not run merely because Next.js imported this
 * module while collecting route configuration at build time.
 */
const serverEnvSchema = z.object({});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverEnvSchema.safeParse({});

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing server environment variables: ${missing}.`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
