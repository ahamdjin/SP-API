import { feesRequestSchema } from "@/lib/schemas";
import { callSpApi, privateHeaders, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = feesRequestSchema.parse(await request.json());

    const sandbox = input.environment === "sandbox";
    const resource = sandbox ? "items" : input.idType === "ASIN" ? "items" : "listings";
    const identifier = sandbox ? "B00V5DG6IQ" : input.identifier;
    const marketplaceId = sandbox ? "ATVPDKIKX0DER" : input.marketplaceId;
    const currency = sandbox ? "USD" : input.currency.toUpperCase();
    const listingPrice = sandbox ? 10 : input.price;
    const shipping = sandbox ? 10 : input.shipping;
    const isAmazonFulfilled = sandbox ? false : input.isAmazonFulfilled;

    const result = await callSpApi({
      credentials: input,
      marketplaceId,
      path: `/products/fees/v0/${resource}/${encodeURIComponent(identifier)}/feesEstimate`,
      method: "POST",
      environment: input.environment,
      body: {
        FeesEstimateRequest: {
          MarketplaceId: marketplaceId,
          IsAmazonFulfilled: isAmazonFulfilled,
          PriceToEstimateFees: {
            ListingPrice: { CurrencyCode: currency, Amount: listingPrice },
            Shipping: { CurrencyCode: currency, Amount: shipping },
            ...(sandbox ? {
              Points: {
                PointsNumber: 0,
                PointsMonetaryValue: { CurrencyCode: "USD", Amount: 0 },
              },
            } : {}),
          },
          Identifier: sandbox ? "UmaS1" : `sp-api-workbench-${Date.now()}`,
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
