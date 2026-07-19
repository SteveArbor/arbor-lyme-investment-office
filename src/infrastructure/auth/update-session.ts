import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnv } from "@/config/env.public";

/**
 * Refreshes the Supabase session cookie on every matched request and
 * redirects unauthenticated users away from protected routes. This is the
 * "current recommended server-side authentication mechanism" for Next.js
 * middleware per Supabase's SSR guidance — session refresh happens here
 * (once, on the request path) rather than being re-derived in every
 * Server Component.
 *
 * Route protection is intentionally simple for Foundation: everything
 * under the app's (protected) route group requires a session; everything
 * else (sign-in) does not. As the role model grows (multi-user, per
 * docs/architecture.md), authorization *decisions* remain RLS's job — this
 * middleware only handles "is there a session at all."
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: this call must not be removed. It revalidates the session
  // against Supabase Auth (not just a local JWT decode) and is what
  // actually triggers a token refresh when the access token has expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/settings");
  const isAuthRoute = request.nextUrl.pathname.startsWith("/sign-in");

  if (!user && isProtectedRoute) {
    const redirectUrl = new URL("/sign-in", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}
