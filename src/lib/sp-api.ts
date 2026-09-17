import { endpoints, getMarketplace } from "@/lib/marketplaces";
import type { Credentials } from "@/lib/schemas";
import { ZodError } from "zod";

type AmazonResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  requestId: string | null;
  rateLimit: string | null;
  data: unknown;
  durationMs: number;
};

export class SpApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "SpApiError";
    this.status = status;
    this.details = details;
  }
}

export async function getAccessToken(credentials: Credentials) {
  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    cache: "no-store",
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new SpApiError(extractMessage(data, "Amazon rejected the supplied LWA credentials"), response.status, data);
  }

  const accessToken = isRecord(data) && typeof data.access_token === "string" ? data.access_token : null;
  if (!accessToken) {
    throw new SpApiError("Amazon returned no access token", 502, data);
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
}: {
  credentials: Credentials;
  marketplaceId: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<AmazonResponse> {
  const marketplace = getMarketplace(marketplaceId);
  if (!marketplace) throw new SpApiError("Unsupported marketplace", 400);

  const { accessToken } = await getAccessToken(credentials);
  const startedAt = performance.now();
  const response = await fetch(`${endpoints[marketplace.region]}${path}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "SP-API-Workbench/1.0 (Language=TypeScript; Platform=Node.js)",
      "x-amz-access-token": accessToken,
      "x-amz-date": toAmazonDate(new Date()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await readJson(response);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    requestId: response.headers.get("x-amzn-requestid"),
    rateLimit: response.headers.get("x-amzn-ratelimit-limit"),
    data,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { ok: false, error: error.issues[0]?.message ?? "Invalid request", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
      { status: 400, headers: privateHeaders },
    );
  }

  if (error instanceof SpApiError) {
    return Response.json(
      { ok: false, error: error.message, details: error.details ?? null },
      { status: error.status, headers: privateHeaders },
    );
  }

  console.error("SP-API request failed", error instanceof Error ? error.message : "Unknown error");
  return Response.json(
    { ok: false, error: "The request could not be completed. Check the server logs for a sanitized error." },
    { status: 500, headers: privateHeaders },
  );
}

export const privateHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

function toAmazonDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
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
