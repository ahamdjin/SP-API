import { getMarketplace } from "@/lib/marketplaces";
import { catalogRequestSchema } from "@/lib/schemas";
import { callSpApi, privateHeaders, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

const includedData = [
  "attributes",
  "classifications",
  "dimensions",
  "identifiers",
  "images",
  "productTypes",
  "relationships",
  "salesRanks",
  "summaries",
  "vendorDetails",
].join(",");

export async function POST(request: Request) {
  try {
    const input = catalogRequestSchema.parse(await request.json());
    const marketplace = getMarketplace(input.marketplaceId);
    if (!marketplace) return Response.json({ ok: false, error: "Unsupported marketplace" }, { status: 400 });

    const params = new URLSearchParams({
      marketplaceIds: input.marketplaceId,
      includedData,
      locale: marketplace.locale,
      pageSize: "20",
    });

    if (input.mode === "keywords") {
      params.set("keywords", input.query);
      params.set("keywordsLocale", marketplace.locale);
    } else {
      params.set("identifiers", input.query.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 20).join(","));
      params.set("identifiersType", input.identifierType);
      if (input.identifierType === "SKU") params.set("sellerId", input.sellerId);
    }

    const result = await callSpApi({
      credentials: input,
      marketplaceId: input.marketplaceId,
      path: `/catalog/2022-04-01/items?${params.toString()}`,
    });

    return Response.json(result, { status: result.ok ? 200 : result.status, headers: privateHeaders });
  } catch (error) {
    return toErrorResponse(error);
  }
}
