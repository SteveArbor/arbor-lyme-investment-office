import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Security headers (Foundation brief §21). This is a `'unsafe-inline'`
 * baseline CSP, not the stricter nonce-based approach Next.js also
 * supports — a deliberate, documented trade-off, not an oversight:
 * nonce-based CSP requires every page in the app to be dynamically
 * rendered (Next.js can only inject a nonce during server-side rendering
 * of an actual request, so a statically generated page has no request to
 * derive one from), which would force our current static pages
 * (/, /sign-in, /access-denied, /_not-found) into dynamic rendering
 * app-wide purely for CSP strictness. Foundation's actual attack surface
 * doesn't yet justify that cost: there is no third-party script, no
 * `dangerouslySetInnerHTML`, and no user-controlled content ever rendered
 * as HTML (docs/threat-model.md §4) — React's default escaping is the
 * primary XSS control today. Revisit nonces if/when a third-party script
 * or rich-text rendering feature is added (see docs/threat-model.md).
 */
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self';
  connect-src 'self' https://*.supabase.co;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Vercel terminates TLS; this instructs browsers to always use HTTPS for
  // this origin going forward. No `preload` directive — that submits the
  // domain to browsers' built-in preload lists, a much harder-to-reverse
  // commitment than this milestone should make unilaterally.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
