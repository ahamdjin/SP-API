import "server-only";

import { getEndpoint, getMarketplace, type SpApiEnvironment } from "@/lib/marketplaces";
import type { Credentials } from "@/lib/schemas";
import { ZodError } from "zod";

export type SpApiProblem = {
  code: string;
  message: string;
  details: string | null;
  action: string;
  retryable: boolean;
};

type AmazonResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  requestId: string | null;
  gatewayId: string | null;
  traceId: string | null;
  rateLimit: string | null;
  data: unknown;
  durationMs: number;
  attempts: number;
  problem: SpApiProblem | null;
};

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type RetryMode = "read" | "write" | "safe-post";

export class SpApiError extends Error {
  status: number;
  details?: unknown;
  code?: string;

  constructor(message: string, status = 500, details?: unknown, code?: string) {
    super(message);
    this.name = "SpApiError";
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

export async function getAccessToken(credentials: Credentials) {
  const { response } = await fetchWithRetry("https://api.amazon.com/auth/o2/token", () => ({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }), "safe-post");

  const data = await readJson(response);
  if (!response.ok) {
    throw new SpApiError(
      extractMessage(data, "Amazon rejected the supplied LWA credentials"),
      response.status,
      data,
      extractCode(data) || "LWA_AUTH_FAILED",
    );
  }

  const accessToken = isRecord(data) && typeof data.access_token === "string" ? data.access_token : null;
  if (!accessToken) {
    throw new SpApiError("Amazon returned no access token", 502, data, "LWA_TOKEN_MISSING");
  }

  return {
    accessToken,
    expiresIn: isRecord(data) && typeof data.expires_in === "number" ? data.expires_in : 3600,
  };
}

export async function callSpApi({
  credentials,
  marketplaceId,
  path,
  method = "GET",
  body,
  accessToken,
  environment = "production",
}: {
  credentials: Credentials;
  marketplaceId: string;
  path: string;
  method?: HttpMethod;
  body?: unknown;
  accessToken?: string;
  environment?: SpApiEnvironment;
}): Promise<AmazonResponse> {
  const marketplace = getMarketplace(marketplaceId);
  if (!marketplace) throw new SpApiError("Unsupported marketplace", 400, { marketplaceId }, "UNSUPPORTED_MARKETPLACE");

  const token = accessToken ?? (await getAccessToken(credentials)).accessToken;
  const startedAt = performance.now();
  const url = `${getEndpoint(marketplace.region, environment)}${path}`;

  const retryMode: RetryMode = method === "GET" ? "read" : "write";
  const { response, attempts } = await fetchWithRetry(url, () => ({
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "user-agent": "SP-API-Workbench/1.2 (Language=TypeScript; Platform=Node.js)",
      "x-amz-access-token": token,
      "x-amz-date": toAmazonDate(new Date()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }), retryMode);

  const data = await readJson(response);
  const requestId = response.headers.get("x-amzn-requestid");
  const problem = response.ok ? null : buildProblem({
    status: response.status,
    statusText: response.statusText,
    data,
    headerCode: response.headers.get("x-amzn-errortype"),
    method,
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    requestId,
    gatewayId: response.headers.get("x-amz-apigw-id"),
    traceId: response.headers.get("x-amzn-trace-id"),
    rateLimit: response.headers.get("x-amzn-ratelimit-limit"),
    data,
    durationMs: Math.round(performance.now() - startedAt),
    attempts,
    problem,
  };
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? "Invalid request";
    return Response.json(
      {
        ok: false,
        error: message,
        issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        problem: {
          code: "INPUT_VALIDATION",
          message,
          details: error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; "),
          action: "Correct the highlighted request fields and run the operation again.",
          retryable: false,
        } satisfies SpApiProblem,
      },
      { status: 400, headers: privateHeaders },
    );
  }

  if (error instanceof SyntaxError) {
    const problem: SpApiProblem = {
      code: "INVALID_JSON",
      message: "The request body is not valid JSON.",
      details: error.message,
      action: "Correct the JSON syntax and submit the request again.",
      retryable: false,
    };
    return Response.json(
      { ok: false, error: problem.message, problem },
      { status: 400, headers: privateHeaders },
    );
  }

  if (error instanceof SpApiError) {
    const problem = buildProblem({
      status: error.status,
      statusText: "",
      data: error.details,
      fallbackMessage: error.message,
      fallbackCode: error.code,
    });
    return Response.json(
      { ok: false, error: problem.message, details: error.details ?? null, problem },
      { status: error.status, headers: privateHeaders },
    );
  }

  console.error("SP-API request failed", error instanceof Error ? error.message : "Unknown error");
  const problem: SpApiProblem = {
    code: "CLIENT_INTERNAL_ERROR",
    message: "The request could not be completed by the workbench.",
    details: error instanceof Error ? error.message : null,
    action: "Check the server log. For reads, retry after correcting the local/network issue. If this happened during a write, verify the Amazon resource or job state before submitting the write again.",
    retryable: false,
  };
  return Response.json(
    { ok: false, error: problem.message, problem },
    { status: 500, headers: privateHeaders },
  );
}

export const privateHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function fetchWithRetry(url: string, initFactory: () => RequestInit, retryMode: RetryMode) {
  const maxAttempts = 4;
  let response: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(url, initFactory());
    } catch (error) {
      lastError = error;
      const canRetryNetwork = retryMode !== "write";
      if (canRetryNetwork && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, clampDelay(750 * 2 ** (attempt - 1))));
        continue;
      }

      const details = {
        url: safeUrlForDiagnostics(url),
        cause: error instanceof Error ? error.message : String(error),
        timeout: isTimeoutError(error),
        ambiguousWriteResult: retryMode === "write",
      };

      if (retryMode === "write") {
        throw new SpApiError(
          "The connection failed while sending an Amazon write request. Amazon may have received the request even though no response reached the workbench.",
          502,
          details,
          "AMBIGUOUS_WRITE_RESULT",
        );
      }

      throw new SpApiError(
        isTimeoutError(error) ? "The request to Amazon timed out." : "The workbench could not reach Amazon.",
        502,
        details,
        isTimeoutError(error) ? "AMAZON_TIMEOUT" : "AMAZON_NETWORK_ERROR",
      );
    }

    if (!shouldRetryStatus(response.status, retryMode) || attempt === maxAttempts) {
      return { response, attempts: attempt };
    }

    const delayMs = retryDelayMs(response, attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (response) return { response, attempts: maxAttempts };
  throw new SpApiError(
    "Amazon request did not produce a response",
    502,
    { cause: lastError instanceof Error ? lastError.message : lastError },
    "NO_RESPONSE",
  );
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return clampDelay(seconds * 1000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return clampDelay(at - Date.now());
  }

  if (response.status === 429) {
    const rate = Number(response.headers.get("x-amzn-ratelimit-limit"));
    if (Number.isFinite(rate) && rate > 0) return clampDelay((1 / rate) * 1000);
  }

  return clampDelay(750 * 2 ** (attempt - 1));
}

function clampDelay(value: number) {
  return Math.min(Math.max(Math.round(value), 500), 15_000);
}

function isTransientStatus(status: number) {
  return [429, 500, 502, 503, 504].includes(status);
}

function shouldRetryStatus(status: number, retryMode: RetryMode) {
  if (status === 429) return true;
  if ([500, 502, 503, 504].includes(status)) return retryMode !== "write";
  return false;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || /timeout|timed out/i.test(error.message));
}

function safeUrlForDiagnostics(value: string) {
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    return "Amazon SP-API endpoint";
  }
}

function toAmazonDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function buildProblem({
  status,
  statusText,
  data,
  headerCode,
  fallbackMessage,
  fallbackCode,
  method,
}: {
  status: number;
  statusText: string;
  data: unknown;
  headerCode?: string | null;
  fallbackMessage?: string;
  fallbackCode?: string;
  method?: HttpMethod;
}): SpApiProblem {
  const first = firstError(data);
  const code = first.code || extractCode(data) || fallbackCode || headerCode?.split(":")[0] || `HTTP_${status}`;
  const message = first.message || extractMessage(data, fallbackMessage || statusText || `Amazon returned HTTP ${status}`);
  const details = first.details || extractDetails(data);
  const retryable = status === 429 || (method === "GET" && isTransientStatus(status));
  return {
    code,
    message,
    details,
    action: recommendedAction(code, status, message, retryable, method),
    retryable,
  };
}

function recommendedAction(code: string, status: number, message: string, retryable: boolean, method?: HttpMethod) {
  const key = `${code} ${message}`.toLowerCase();

  if (key.includes("ambiguous_write_result")) {
    return "Do not blindly submit the write again. First check the related Amazon resource or job status to see whether the original request was applied. Retry only after you can confirm it was not.";
  }
  if (key.includes("amazon_timeout") || key.includes("amazon_network_error")) {
    return "For a read request, retry with backoff. If this repeats, check Amazon SP-API status and your server network/TLS connectivity.";
  }
  if (key.includes("invalid_grant") || key.includes("refresh token")) {
    return "Self-authorize or reconnect the seller account to obtain a fresh refresh token, then retry.";
  }
  if (key.includes("invalid_client") || key.includes("client authentication")) {
    return "Verify the LWA client ID and client secret belong to the same SP-API app. Rotate the client secret if necessary.";
  }
  if (key.includes("expiredtoken") || key.includes("expired token")) {
    return "Request a new LWA access token. If a fresh token is also rejected, reauthorize the seller account.";
  }
  if (status === 401 || status === 403 || key.includes("unauthorized") || key.includes("accessdenied") || key.includes("access denied")) {
    return "Verify the seller authorized this app and that the app has the Amazon role required by this operation/report. Reauthorize after changing roles.";
  }
  if (key.includes("could not match input arguments") || key.includes("sandbox request")) {
    return "Amazon's static sandbox only accepts predefined request examples. Use the exact sandbox marketplace, IDs, parameters, and included-data values documented for this operation. Do not use arbitrary production IDs in static Sandbox mode.";
  }
    if (status === 429 || key.includes("throttl") || key.includes("quota")) {
    return "Slow the request rate and honor Retry-After / x-amzn-RateLimit-Limit. Retry the same request after the throttle window.";
  }
  if (status === 400 || key.includes("badrequest") || key.includes("invalidinput") || key.includes("invalid input")) {
    return "Check required fields, IDs, date ranges, enum values, marketplace, and URL encoding. Correct the request before retrying.";
  }
  if (status === 404) {
    return "Verify the resource ID, marketplace, and environment. Sandbox IDs and production IDs are not interchangeable.";
  }
  if (status === 409) {
    return "Re-read the current Amazon resource state, then retry only if the requested transition is still valid.";
  }
  if (status === 413) {
    return "Reduce the request or document size and submit it in smaller supported batches.";
  }
  if (status === 415) {
    return "Use the Content-Type required by this operation and ensure the body format matches it.";
  }
  if (status === 422) {
    return "The request is syntactically valid but violates an Amazon business rule. Read the error details, correct the resource state/data, and retry.";
  }
  if (status >= 500 && method && method !== "GET") {
    return "Amazon returned a server error for a write request. Do not immediately resubmit it. Verify the related feed, report, inbound plan, or other resource first; if it was not created/applied, then retry. Keep the Amazon request ID for support.";
  }
  if (retryable || status >= 500) {
    return "Retry with backoff. If the error persists, use the Amazon request ID shown by the workbench when contacting SP-API support.";
  }
  return "Read the Amazon error details and request ID below, correct the indicated condition, and retry only after the underlying issue is fixed.";
}

function firstError(data: unknown) {
  if (!isRecord(data) || !Array.isArray(data.errors)) return { code: "", message: "", details: null as string | null };
  const first = data.errors.find(isRecord);
  if (!first) return { code: "", message: "", details: null as string | null };
  return {
    code: typeof first.code === "string" ? first.code : "",
    message: typeof first.message === "string" ? first.message : "",
    details: stringifyDetails(first.details),
  };
}

function extractCode(data: unknown) {
  if (!isRecord(data)) return "";
  if (typeof data.error === "string") return data.error;
  if (typeof data.code === "string") return data.code;
  return "";
}

function extractDetails(data: unknown) {
  if (!isRecord(data)) return null;
  return stringifyDetails(data.details);
}

function stringifyDetails(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractMessage(data: unknown, fallback: string) {
  if (!isRecord(data)) return fallback;
  if (typeof data.error_description === "string") return data.error_description;
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  return fallback;
}
