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
  rateLimit: string | null;
  data: unknown;
  durationMs: number;
  attempts: number;
  problem: SpApiProblem | null;
};

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
  }));

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
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string;
  environment?: SpApiEnvironment;
}): Promise<AmazonResponse> {
  const marketplace = getMarketplace(marketplaceId);
  if (!marketplace) throw new SpApiError("Unsupported marketplace", 400, { marketplaceId }, "UNSUPPORTED_MARKETPLACE");

  const token = accessToken ?? (await getAccessToken(credentials)).accessToken;
  const startedAt = performance.now();
  const url = `${getEndpoint(marketplace.region, environment)}${path}`;

  const { response, attempts } = await fetchWithRetry(url, () => ({
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "user-agent": "SP-API-Workbench/1.1 (Language=TypeScript; Platform=Node.js)",
      "x-amz-access-token": token,
      "x-amz-date": toAmazonDate(new Date()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }));

  const data = await readJson(response);
  const requestId = response.headers.get("x-amzn-requestid");
  const problem = response.ok ? null : buildProblem({
    status: response.status,
    statusText: response.statusText,
    data,
    headerCode: response.headers.get("x-amzn-errortype"),
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    requestId,
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
    action: "Check the server log. If this is a network timeout, retry once; if it repeats, inspect the failing route before using a production write operation.",
    retryable: true,
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

async function fetchWithRetry(url: string, initFactory: () => RequestInit) {
  const maxAttempts = 4;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = await fetch(url, initFactory());
    if (!isTransientStatus(response.status) || attempt === maxAttempts) {
      return { response, attempts: attempt };
    }

    const delayMs = retryDelayMs(response, attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (!response) throw new SpApiError("Amazon request did not produce a response", 502, null, "NO_RESPONSE");
  return { response, attempts: maxAttempts };
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
}: {
  status: number;
  statusText: string;
  data: unknown;
  headerCode?: string | null;
  fallbackMessage?: string;
  fallbackCode?: string;
}): SpApiProblem {
  const first = firstError(data);
  const code = first.code || extractCode(data) || fallbackCode || headerCode?.split(":")[0] || `HTTP_${status}`;
  const message = first.message || extractMessage(data, fallbackMessage || statusText || `Amazon returned HTTP ${status}`);
  const details = first.details || extractDetails(data);
  const retryable = isTransientStatus(status);
  return {
    code,
    message,
    details,
    action: recommendedAction(code, status, message, retryable),
    retryable,
  };
}

function recommendedAction(code: string, status: number, message: string, retryable: boolean) {
  const key = `${code} ${message}`.toLowerCase();

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
