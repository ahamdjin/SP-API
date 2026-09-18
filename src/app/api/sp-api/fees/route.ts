import { feesRequestSchema } from "@/lib/schemas";
import { callSpApi, privateHeaders, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = feesRequestSchema.parse(await request.json());

    const resource = input.idType === "ASIN" ? "items" : "listings";
    const requestIdentifier = input.requestIdentifier || `sp-api-workbench-${Date.now()}`;
    const points = input.pointsNumber !== undefined || input.pointsAmount !== undefined
      ? {
          PointsNumber: input.pointsNumber ?? 0,
          PointsMonetaryValue: {
            CurrencyCode: input.currency.toUpperCase(),
            Amount: input.pointsAmount ?? 0,
          },
        }
      : undefined;

    const result = await callSpApi({
      credentials: input,
      marketplaceId: input.marketplaceId,
      path: `/products/fees/v0/${resource}/${encodeURIComponent(input.identifier)}/feesEstimate`,
      method: "POST",
      environment: input.environment,
      body: {
        FeesEstimateRequest: {
          MarketplaceId: input.marketplaceId,
          IsAmazonFulfilled: input.isAmazonFulfilled,
          PriceToEstimateFees: {
            ListingPrice: { CurrencyCode: input.currency.toUpperCase(), Amount: input.price },
            Shipping: { CurrencyCode: input.currency.toUpperCase(), Amount: input.shipping },
            ...(points ? { Points: points } : {}),
          },
          Identifier: requestIdentifier,
        },
      },
    });

    if (result.ok) {
      const data = record(result.data);
      const payload = record(data.payload);
      const feeResult = record(payload.FeesEstimateResult);
      const feeStatus = typeof feeResult.Status === "string" ? feeResult.Status : "";
      if (feeStatus && feeStatus !== "Success") {
        const feeError = record(feeResult.Error);
        const code = typeof feeError.Code === "string" && feeError.Code ? feeError.Code : "FEE_ESTIMATE_" + feeStatus.toUpperCase();
        const message = typeof feeError.Message === "string" && feeError.Message
          ? feeError.Message
          : "Amazon returned a fee-estimate business error.";
        const serviceError = feeStatus === "ServiceError";
        const failed = {
          ...result,
          ok: false,
          status: 422,
          statusText: "Fee estimate " + feeStatus,
          problem: {
            code,
            message,
            details: feeError.Detail ? JSON.stringify(feeError.Detail) : null,
            action: serviceError
              ? "Amazon's fee service reported a service error. Retry the estimate with backoff; if it repeats, keep the Amazon request ID for support."
              : "Check the ASIN/SKU, marketplace, price, shipping, currency, and fulfillment choice. Correct the input before requesting another estimate.",
            retryable: serviceError,
          },
        };
        return Response.json(failed, { status: 422, headers: privateHeaders });
      }
    }

    return Response.json(result, { status: result.ok ? 200 : result.status, headers: privateHeaders });
  } catch (error) {
    return toErrorResponse(error);
  }
}


function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}
