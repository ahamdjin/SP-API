import { baseRequestSchema } from "@/lib/schemas";
import { callSpApi, getAccessToken, privateHeaders, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = baseRequestSchema.parse(await request.json());
    const token = await getAccessToken(input);
    const probe = await callSpApi({
      credentials: input,
      marketplaceId: input.marketplaceId,
      environment: input.environment,
      path: "/sellers/v1/marketplaceParticipations",
      accessToken: token.accessToken,
    });

    if (!probe.ok) {
      return Response.json(probe, { status: probe.status, headers: privateHeaders });
    }

    return Response.json(
      {
        ok: true,
        status: probe.status,
        statusText: probe.statusText,
        requestId: probe.requestId,
        rateLimit: probe.rateLimit,
        durationMs: probe.durationMs,
        attempts: probe.attempts,
        expiresIn: token.expiresIn,
        data: probe.data,
        message: `LWA credentials and the ${input.environment} SP-API endpoint both accepted the request.`,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
