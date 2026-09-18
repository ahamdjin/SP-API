import { feesRequestSchema } from "@/lib/schemas";
import { callSpApi, privateHeaders, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = feesRequestSchema.parse(await request.json());
    const resource = input.idType === "ASIN" ? "items" : "listings";
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
          },
          Identifier: `sp-api-workbench-${Date.now()}`,
        },
      },
    });

    return Response.json(result, { status: result.ok ? 200 : result.status, headers: privateHeaders });
  } catch (error) {
    return toErrorResponse(error);
  }
}
