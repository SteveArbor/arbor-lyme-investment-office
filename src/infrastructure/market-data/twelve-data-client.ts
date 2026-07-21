import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from "@/domain/shared";

const PROVIDER_NAME = "Twelve Data";
const BASE_URL = "https://api.twelvedata.com";

/**
 * Twelve Data returns HTTP 200 for most errors, with the failure encoded
 * in the JSON body (`{ code, message, status: "error" }`) — a vendor
 * quirk this client absorbs here, once, so every provider implementation
 * built on top of it throws the same three domain errors
 * (`domain/shared`) regardless of whether the failure was an HTTP-level
 * or body-level one. ADR 0030/0031.
 */
interface TwelveDataErrorBody {
  code?: number;
  message?: string;
  status?: string;
}

function isErrorBody(body: unknown): body is TwelveDataErrorBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    (body as TwelveDataErrorBody).status === "error"
  );
}

export async function twelveDataGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string | undefined
): Promise<T> {
  if (!apiKey) {
    throw new ProviderAuthError(PROVIDER_NAME);
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("apikey", apiKey);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (cause) {
    throw new ProviderUnavailableError(
      PROVIDER_NAME,
      cause instanceof Error ? cause.message : String(cause)
    );
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    throw new ProviderRateLimitError(
      PROVIDER_NAME,
      retryAfterHeader ? Number(retryAfterHeader) : undefined
    );
  }

  // Twelve Data most commonly encodes a failure as HTTP 200 with
  // `{status:"error", code, message}` in the body, but some failures (e.g.
  // a plan-tier restriction on a specific symbol, found live during ADR
  // 0031 validation: LSE/Euronext quotes 404 with an "upgrade your plan"
  // message) come back as a genuine non-2xx HTTP status *with that same
  // informative body attached*. Reading the body before branching on
  // `response.ok` means the vendor's actual message always reaches the
  // thrown error, instead of being discarded in favour of a bare
  // "HTTP 404" whenever the status happens not to be 200.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (isErrorBody(body)) {
    if (body.code === 429) {
      throw new ProviderRateLimitError(PROVIDER_NAME);
    }
    if (body.code === 401 || body.code === 403) {
      throw new ProviderAuthError(PROVIDER_NAME);
    }
    throw new ProviderUnavailableError(PROVIDER_NAME, body.message ?? `HTTP ${response.status}`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError(PROVIDER_NAME);
  }
  if (!response.ok) {
    throw new ProviderUnavailableError(PROVIDER_NAME, `HTTP ${response.status}`);
  }

  return body as T;
}
