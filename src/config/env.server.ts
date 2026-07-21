import "server-only";

import { z } from "zod";

/**
 * Server-only environment configuration. The `server-only` import above
 * makes it a build-time error to import this module from a Client
 * Component, so a server secret can never end up in the browser bundle
 * (docs/security-principles.md, docs/threat-model.md §9).
 *
 * `TWELVE_DATA_API_KEY` (ADR 0030/0031) is the first real server-only
 * secret this file validates — optional, not required: the app must keep
 * working with the Price Engine simply unconfigured (manual price marking
 * still works with no key at all) rather than failing to boot everywhere
 * because one milestone's feature isn't set up yet. `TwelveDataPriceProvider`/
 * `TwelveDataMarketStatusProvider` throw `ProviderAuthError` at the point
 * of use if a caller reaches them with no key configured — not here.
 *
 * There is still no service-role client (profile creation uses a database
 * trigger, not a privileged client — see docs/implementation/foundation.md)
 * and no cron route yet (CRON_SECRET is unused until a scheduled job
 * exists — Stage 1's overnight refresh is explicitly deferred to the next
 * milestone, per ADR 0031). This file is structured so future server-only
 * variables are added to one place, validated the same way, rather than
 * read ad hoc from `process.env` at each call site.
 *
 * Validation is lazy (on first call to getServerEnv()) for the same reason
 * as env.public.ts: it must not run merely because Next.js imported this
 * module while collecting route configuration at build time.
 */
const serverEnvSchema = z.object({
  TWELVE_DATA_API_KEY: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverEnvSchema.safeParse({
    TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing server environment variables: ${missing}.`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
