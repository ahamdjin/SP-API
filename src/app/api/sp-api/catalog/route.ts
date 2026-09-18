import { getMarketplace } from "@/lib/marketplaces";
import { catalogRequestSchema } from "@/lib/schemas";
import { callSpApi, getAccessToken, privateHeaders, SpApiError, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

const defaultIncludedData = [
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

const allowedIncludedData = new Set([
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
]);

// Catalog API entry point: validates search input and chooses exact-item, family, or paginated search behavior.
export async function POST(request: Request) {
  try {
    const input = catalogRequestSchema.parse(await request.json());
    const marketplace = getMarketplace(input.marketplaceId);
    if (!marketplace) return Response.json({ ok: false, error: "Unsupported marketplace" }, { status: 400 });

    const identifiers = splitCsv(input.query).slice(0, 20).map((identifier) => input.identifierType === "ASIN" ? identifier.toUpperCase() : identifier);
    const { accessToken } = await getAccessToken(input);

    const requestedIncludedData = normalizeIncludedData(input.includedData);


    if (input.mode === "identifier" && input.identifierType === "ASIN" && identifiers.length === 1 && input.includeVariations) {
      const result = await getCompleteRelatedCatalog({
        credentials: input,
        marketplaceId: input.marketplaceId,
        locale: marketplace.locale,
        environment: input.environment,
        requestedAsin: identifiers[0],
        includedData: requestedIncludedData,
        accessToken,
      });
      return Response.json(result, { status: result.ok ? 200 : result.status, headers: privateHeaders });
    }

    if (input.mode === "identifier" && input.identifierType === "ASIN" && identifiers.length === 1) {
      const params = new URLSearchParams({
        marketplaceIds: input.marketplaceId,
        includedData: requestedIncludedData,
      });
      if (input.environment === "production") params.set("locale", marketplace.locale);

      const result = await callSpApi({
        credentials: input,
        marketplaceId: input.marketplaceId,
        path: `/catalog/2022-04-01/items/${encodeURIComponent(identifiers[0])}?${params.toString()}`,
        accessToken,
        environment: input.environment,
      });

      if (result.ok) {
        return Response.json(
          { ...result, data: { numberOfResults: 1, items: [result.data] } },
          { status: 200, headers: privateHeaders },
        );
      }
      return Response.json(result, { status: result.status, headers: privateHeaders });
    }

    const params = new URLSearchParams({
      marketplaceIds: input.marketplaceId,
      includedData: requestedIncludedData,
    });
    if (input.environment === "production") {
      params.set("locale", marketplace.locale);
      params.set("pageSize", String(input.pageSize));
    }

    if (input.mode === "keywords") {
      params.set("keywords", input.query);
      if (input.environment === "production") params.set("keywordsLocale", marketplace.locale);
      addCsv(params, "brandNames", input.brandNames);
      addCsv(params, "classificationIds", input.classificationIds);
      if (input.pageToken) params.set("pageToken", input.pageToken);
    } else {
      params.set("identifiers", identifiers.join(","));
      params.set("identifiersType", input.identifierType);
      if (input.identifierType === "SKU") params.set("sellerId", input.sellerId);
    }

    const result = await callSpApi({
      credentials: input,
      marketplaceId: input.marketplaceId,
      path: `/catalog/2022-04-01/items?${params.toString()}`,
      accessToken,
      environment: input.environment,
    });

    return Response.json(result, { status: result.ok ? 200 : result.status, headers: privateHeaders });
  } catch (error) {
    return toErrorResponse(error);
  }
}

type FamilyInput = {
  credentials: Parameters<typeof callSpApi>[0]["credentials"];
  marketplaceId: string;
  locale: string;
  requestedAsin: string;
  includedData: string;
  accessToken: string;
  environment: Parameters<typeof callSpApi>[0]["environment"];
};

// Follows Amazon relationship data to collect the requested ASIN plus discoverable parent/child family items.
async function getCompleteRelatedCatalog(input: FamilyInput) {
  const exact = await getCatalogItem(input, input.requestedAsin);
  if (!exact.ok) return exact;

  const items = new Map<string, Record<string, unknown>>();
  const warnings: Array<{
    asins: string[];
    status: number;
    code: string;
    message: string;
    action: string;
    requestId: string | null;
  }> = [];
  const attemptedAsins = new Set<string>([input.requestedAsin]);
  let durationMs = exact.durationMs;
  addItem(items, exact.data);

  const initialRelations = getRelatedAsins(exact.data);
  const parentAsins = initialRelations.parents.filter((asin) => asin !== input.requestedAsin);
  const familyAsins = new Set<string>([input.requestedAsin]);
  for (const asin of [...initialRelations.parents, ...initialRelations.children]) familyAsins.add(asin);

  while (true) {
    const missing = [...familyAsins].filter((asin) => !items.has(asin) && !attemptedAsins.has(asin));
    if (!missing.length) break;
    for (const batch of chunks(missing, 20)) {
      batch.forEach((asin) => attemptedAsins.add(asin));
      const related = await searchCatalogAsins(input, batch);
      durationMs += related.durationMs;
      if (related.ok) {
        const data = asRecord(related.data);
        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            addItem(items, item);
            const relations = getRelatedAsins(item);
            for (const asin of [...relations.parents, ...relations.children]) familyAsins.add(asin);
          }
        }
      } else {
        warnings.push({
          asins: batch,
          status: related.status,
          code: related.problem?.code || `HTTP_${related.status}`,
          message: related.problem?.message || amazonMessage(related.data),
          action: related.problem?.action || "Retry the related-ASIN lookup after correcting the reported Amazon error.",
          requestId: related.requestId,
        });
      }
    }
  }

  const ordered = [...items.values()].sort((left, right) => {
    const leftAsin = stringValue(left.asin);
    const rightAsin = stringValue(right.asin);
    if (leftAsin === input.requestedAsin) return -1;
    if (rightAsin === input.requestedAsin) return 1;
    if (parentAsins.includes(leftAsin) && !parentAsins.includes(rightAsin)) return -1;
    if (parentAsins.includes(rightAsin) && !parentAsins.includes(leftAsin)) return 1;
    return leftAsin.localeCompare(rightAsin);
  });

  return {
    ...exact,
    durationMs,
    data: {
      numberOfResults: ordered.length,
      items: ordered,
      family: {
        requestedAsin: input.requestedAsin,
        parentAsins,
        relatedAsins: [...familyAsins].filter((asin) => asin !== input.requestedAsin),
        requestedCount: familyAsins.size,
        returnedCount: ordered.length,
        complete: warnings.length === 0 && ordered.length === familyAsins.size,
        warnings,
      },
    },
  };
}

// Actual single-ASIN Catalog Items request; the shared transport handles authentication/retries.
function getCatalogItem(input: FamilyInput, asin: string) {
  const params = new URLSearchParams({ marketplaceIds: input.marketplaceId, includedData: input.includedData });
  if (input.environment === "production") params.set("locale", input.locale);
  return callSpApi({
    credentials: input.credentials,
    marketplaceId: input.marketplaceId,
    path: `/catalog/2022-04-01/items/${encodeURIComponent(asin)}?${params.toString()}`,
    accessToken: input.accessToken,
    environment: input.environment,
  });
}

function searchCatalogAsins(input: FamilyInput, asins: string[]) {
  const params = new URLSearchParams({
    identifiers: asins.join(","),
    identifiersType: "ASIN",
    marketplaceIds: input.marketplaceId,
    includedData: input.includedData,
  });
  if (input.environment === "production") {
    params.set("locale", input.locale);
    params.set("pageSize", "20");
  }
  return callSpApi({
    credentials: input.credentials,
    marketplaceId: input.marketplaceId,
    path: `/catalog/2022-04-01/items?${params.toString()}`,
    accessToken: input.accessToken,
    environment: input.environment,
  });
}

function getRelatedAsins(value: unknown) {
  const parents = new Set<string>();
  const children = new Set<string>();
  const item = asRecord(value);
  if (!Array.isArray(item.relationships)) return { parents: [], children: [] };
  for (const marketplaceGroup of item.relationships) {
    const group = asRecord(marketplaceGroup);
    if (!Array.isArray(group.relationships)) continue;
    for (const rawRelationship of group.relationships) {
      const relationship = asRecord(rawRelationship);
      if (Array.isArray(relationship.parentAsins)) relationship.parentAsins.forEach((asin) => { if (typeof asin === "string") parents.add(asin); });
      if (Array.isArray(relationship.childAsins)) relationship.childAsins.forEach((asin) => { if (typeof asin === "string") children.add(asin); });
    }
  }
  return { parents: [...parents], children: [...children] };
}

function addItem(items: Map<string, Record<string, unknown>>, value: unknown) {
  const item = asRecord(value);
  const asin = stringValue(item.asin);
  if (asin) items.set(asin, item);
}

function chunks<T>(values: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function normalizeIncludedData(value: string) {
  const entries = splitCsv(value || defaultIncludedData).filter((entry) => allowedIncludedData.has(entry));
  if (!entries.length) return defaultIncludedData;
  const invalid = splitCsv(value).filter((entry) => !allowedIncludedData.has(entry));
  if (invalid.length) {
    throw new SpApiError(
      "Unsupported Catalog includedData value: " + invalid.join(", "),
      400,
      { invalid },
      "INVALID_CATALOG_INCLUDED_DATA",
    );
  }
  return entries.join(",");
}

function splitCsv(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function addCsv(params: URLSearchParams, key: string, value: string) {
  const entries = splitCsv(value);
  if (entries.length) params.set(key, entries.join(","));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function amazonMessage(value: unknown) {
  const data = asRecord(value);
  const errors = Array.isArray(data.errors) ? data.errors : [];
  const first = asRecord(errors[0]);
  return stringValue(first.message) || stringValue(data.message) || "Amazon did not return this related item.";
}
