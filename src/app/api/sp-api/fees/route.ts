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

    return Response.json(result, { status: result.ok ? 200 : result.status, headers: privateHeaders });
  } catch (error) {
    return toErrorResponse(error);
  }
}
