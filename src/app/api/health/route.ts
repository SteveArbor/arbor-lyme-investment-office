import { NextResponse } from "next/server";

/**
 * Minimal health/version endpoint. Deliberately exposes only status,
 * environment name, commit identifier, and timestamp — never secrets,
 * database connection details, or internal configuration
 * (docs/deployment-strategy.md's principle of minimal disclosure), and
 * never dependency versions (a public map of exact package versions is a
 * reconnaissance aid, not an operational necessity here).
 *
 * `VERCEL_GIT_COMMIT_SHA` / `VERCEL_ENV` are populated automatically by
 * Vercel at deploy time; both fall back sensibly for local development,
 * where no such deployment context exists.
 *
 * No separate build-info mechanism is added alongside this — a second
 * endpoint duplicating the same four fields would be speculative scope for
 * a need that doesn't exist yet (YAGNI, docs/engineering-standards.md).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
