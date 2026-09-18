import { getMarketplace } from "@/lib/marketplaces";
import { operationRequestSchema } from "@/lib/schemas";
import { callSpApi, privateHeaders, SpApiError, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

const allOrderData = [
  "BUYER",
  "RECIPIENT",
  "PROCEEDS",
  "EXPENSE",
  "PROMOTION",
  "CANCELLATION",
  "FULFILLMENT",
  "PACKAGES",
  "TAX",
  "PAYMENT",
  "FULFILLMENT_ORDERS",
].join(",");

export async function POST(request: Request) {
  try {
    const input = operationRequestSchema.parse(await request.json());
    const fields = input.fields;
    let result;

    switch (input.operation) {
      case "inventory": {
        const params = new URLSearchParams({
          details: booleanField(fields, "details") ? "true" : "false",
          granularityType: "Marketplace",
          granularityId: input.marketplaceId,
          marketplaceIds: input.marketplaceId,
        });
        addCsv(params, "sellerSkus", optionalString(fields, "sellerSkus"), 50);
        addOptional(params, "startDateTime", optionalDate(fields, "startDateTime"));
        addOptional(params, "nextToken", optionalString(fields, "inventoryNextToken"));
        result = await call(input, "/fba/inventory/v1/summaries?" + params);
        break;
      }
      case "orders": {
        const params = new URLSearchParams({
          marketplaceIds: input.marketplaceId,
          createdAfter: dateField(fields, "createdAfter"),
          maxResultsPerPage: String(numberField(fields, "pageSize", 1, 100, 50)),
          includedData: allOrderData,
        });
        addOptional(params, "createdBefore", optionalDate(fields, "createdBefore"));
        addCsv(params, "fulfillmentStatuses", optionalString(fields, "statuses"), 7);
        addCsv(params, "fulfilledBy", optionalString(fields, "fulfilledBy"), 2);
        addOptional(params, "paginationToken", optionalString(fields, "orderPaginationToken"));
        result = await call(input, "/orders/2026-01-01/orders?" + params);
        break;
      }
      case "order": {
        const orderId = stringField(fields, "orderId");
        result = await call(input, "/orders/2026-01-01/orders/" + encodeURIComponent(orderId) + "?includedData=" + encodeURIComponent(allOrderData));
        break;
      }
      case "reports": {
        const params = new URLSearchParams({
          marketplaceIds: input.marketplaceId,
          pageSize: String(numberField(fields, "pageSize", 1, 100, 20)),
        });
        addCsv(params, "reportTypes", stringField(fields, "reportTypes"), 10);
        addCsv(params, "processingStatuses", optionalString(fields, "processingStatuses"), 5);
        addOptional(params, "createdSince", optionalDate(fields, "createdSince"));
        addOptional(params, "createdUntil", optionalDate(fields, "createdUntil"));
        addOptional(params, "nextToken", optionalString(fields, "reportNextToken"));
        result = await call(input, "/reports/2021-06-30/reports?" + params);
        break;
      }
      case "createReport": {
        requireConfirmation(fields);
        result = await call(input, "/reports/2021-06-30/reports", "POST", {
          reportType: stringField(fields, "reportType"),
          marketplaceIds: [input.marketplaceId],
          ...optionalDateRange(fields),
        });
        break;
      }
      case "report":
        result = await call(input, "/reports/2021-06-30/reports/" + encodeURIComponent(stringField(fields, "reportId")));
        break;
      case "reportDocument":
        result = await call(input, "/reports/2021-06-30/documents/" + encodeURIComponent(stringField(fields, "reportDocumentId")) + "?enableContentEncodingUrlHeader=true");
        break;
      case "feeds": {
        const params = new URLSearchParams({
          marketplaceIds: input.marketplaceId,
          pageSize: String(numberField(fields, "pageSize", 1, 100, 20)),
        });
        addCsv(params, "feedTypes", stringField(fields, "feedTypes"), 10);
        addCsv(params, "processingStatuses", optionalString(fields, "processingStatuses"), 5);
        addOptional(params, "createdSince", optionalDate(fields, "createdSince"));
        addOptional(params, "createdUntil", optionalDate(fields, "createdUntil"));
        addOptional(params, "nextToken", optionalString(fields, "feedNextToken"));
        result = await call(input, "/feeds/2021-06-30/feeds?" + params);
        break;
      }
      case "feed":
        result = await call(input, "/feeds/2021-06-30/feeds/" + encodeURIComponent(stringField(fields, "feedId")));
        break;
      case "submitFeed":
        requireConfirmation(fields);
        result = await submitFeed(input, fields);
        break;
      case "inboundPlans": {
        const params = new URLSearchParams({
          pageSize: String(numberField(fields, "pageSize", 1, 30, 10)),
          sortBy: optionalString(fields, "sortBy") || "LAST_UPDATED_TIME",
          sortOrder: optionalString(fields, "sortOrder") || "DESC",
        });
        addOptional(params, "status", optionalString(fields, "status"));
        addOptional(params, "paginationToken", optionalString(fields, "inboundPaginationToken"));
        result = await call(input, "/inbound/fba/2024-03-20/inboundPlans?" + params);
        break;
      }
      case "inboundPlan":
        result = await call(input, "/inbound/fba/2024-03-20/inboundPlans/" + encodeURIComponent(stringField(fields, "inboundPlanId")));
        break;
      case "inboundShipment":
        result = await call(input, "/inbound/fba/2024-03-20/inboundPlans/" + encodeURIComponent(stringField(fields, "inboundPlanId")) + "/shipments/" + encodeURIComponent(stringField(fields, "shipmentId")));
        break;
      case "prepDetails": {
        const params = new URLSearchParams({ marketplaceId: input.marketplaceId });
        addCsv(params, "mskus", stringField(fields, "mskus"), 100, true);
        result = await call(input, "/inbound/fba/2024-03-20/items/prepDetails?" + params);
        break;
      }
      case "createInboundPlan": {
        requireConfirmation(fields);
        const marketplace = getMarketplace(input.marketplaceId);
        result = await call(input, "/inbound/fba/2024-03-20/inboundPlans", "POST", {
          destinationMarketplaces: [input.marketplaceId],
          name: optionalString(fields, "planName") || undefined,
          sourceAddress: {
            name: stringField(fields, "contactName"),
            companyName: optionalString(fields, "companyName") || undefined,
            addressLine1: stringField(fields, "addressLine1"),
            addressLine2: optionalString(fields, "addressLine2") || undefined,
            city: stringField(fields, "city"),
            stateOrProvinceCode: optionalString(fields, "stateOrProvinceCode") || undefined,
            postalCode: stringField(fields, "postalCode"),
            countryCode: (optionalString(fields, "countryCode") || marketplace?.locale.slice(-2) || "US").toUpperCase(),
            phoneNumber: stringField(fields, "phoneNumber"),
          },
          items: parseItems(stringField(fields, "items")),
        });
        break;
      }
      case "itemLabels": {
        const marketplace = getMarketplace(input.marketplaceId);
        result = await call(input, "/inbound/fba/2024-03-20/items/labels", "POST", {
          marketplaceId: input.marketplaceId,
          labelType: optionalString(fields, "labelType") || "STANDARD_FORMAT",
          pageType: optionalString(fields, "pageType") || "A4_21",
          localeCode: marketplace?.locale || "en_US",
          mskuQuantities: parseItems(stringField(fields, "items"), 100).map(({ msku, quantity }) => ({ msku, quantity })),
        });
        break;
      }
      case "shipmentLabels": {
        const shipmentId = stringField(fields, "shipmentId");
        const params = new URLSearchParams({
          PageType: optionalString(fields, "shipmentPageType") || "PackageLabel_Thermal_NonPCP",
          LabelType: optionalString(fields, "shipmentLabelType") || "UNIQUE",
        });
        addOptional(params, "NumberOfPackages", optionalIntegerField(fields, "numberOfPackages", 1));
        addOptional(params, "NumberOfPallets", optionalIntegerField(fields, "numberOfPallets", 1));
        result = await call(input, "/fba/inbound/v0/shipments/" + encodeURIComponent(shipmentId) + "/labels?" + params);
        break;
      }
      case "billOfLading":
        result = await call(input, "/fba/inbound/v0/shipments/" + encodeURIComponent(stringField(fields, "shipmentId")) + "/billOfLading");
        break;
    }

    return Response.json(result, { status: result.ok ? 200 : result.status, headers: privateHeaders });
  } catch (error) {
    return toErrorResponse(error);
  }
}

type Input = ReturnType<typeof operationRequestSchema.parse>;
type Fields = Record<string, unknown>;

function call(input: Input, path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  return callSpApi({ credentials: input, marketplaceId: input.marketplaceId, path, method, body });
}

async function submitFeed(input: Input, fields: Fields) {
  const contentType = optionalString(fields, "contentType") || "text/tab-separated-values; charset=UTF-8";
  const document = await call(input, "/feeds/2021-06-30/documents", "POST", { contentType });
  if (!document.ok) return document;
  const documentData = record(document.data);
  const url = typeof documentData.url === "string" ? documentData.url : "";
  const feedDocumentId = typeof documentData.feedDocumentId === "string" ? documentData.feedDocumentId : "";
  if (!url || !feedDocumentId) throw new SpApiError("Amazon did not return a feed upload URL", 502, document.data);

  const uploadUrl = new URL(url);
  if (uploadUrl.protocol !== "https:" || !(uploadUrl.hostname === "amazonaws.com" || uploadUrl.hostname.endsWith(".amazonaws.com"))) {
    throw new SpApiError("Amazon returned an unexpected feed upload host", 502);
  }

  const content = stringField(fields, "content");
  if (Buffer.byteLength(content, "utf8") > 5 * 1024 * 1024) {
    throw new SpApiError("Feed content is limited to 5 MB in this local workbench", 413);
  }

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: content,
    cache: "no-store",
  });
  if (!upload.ok) throw new SpApiError("Amazon feed document upload failed", upload.status);

  return call(input, "/feeds/2021-06-30/feeds", "POST", {
    feedType: stringField(fields, "feedType"),
    marketplaceIds: [input.marketplaceId],
    inputFeedDocumentId: feedDocumentId,
  });
}

function stringField(fields: Fields, key: string) {
  const value = fields[key];
  if (typeof value !== "string" || !value.trim()) throw new SpApiError(key + " is required", 400);
  return value.trim();
}

function optionalString(fields: Fields, key: string) {
  const value = fields[key];
  return typeof value === "string" ? value.trim() : "";
}

function booleanField(fields: Fields, key: string) {
  return fields[key] === true || fields[key] === "true";
}

function dateField(fields: Fields, key: string) {
  const value = stringField(fields, key);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new SpApiError(key + " must be a valid date", 400);
  return date.toISOString();
}

function optionalDate(fields: Fields, key: string) {
  const value = optionalString(fields, key);
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new SpApiError(key + " must be a valid date", 400);
  return date.toISOString();
}

function numberField(fields: Fields, key: string, min: number, max: number, fallback: number) {
  const raw = fields[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new SpApiError(key + " must be between " + min + " and " + max, 400);
  return value;
}

function optionalIntegerField(fields: Fields, key: string, min: number) {
  const raw = optionalString(fields, key);
  if (!raw) return "";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) throw new SpApiError(key + " must be an integer of at least " + min, 400);
  return String(value);
}

function addOptional(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
}

function addCsv(params: URLSearchParams, key: string, value: string, max: number, repeated = false) {
  if (!value) return;
  const values = value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
  if (values.length > max) throw new SpApiError(key + " accepts at most " + max + " values", 400);
  if (repeated) values.forEach((entry) => params.append(key, entry));
  else params.set(key, values.join(","));
}

function optionalDateRange(fields: Fields) {
  const dataStartTime = optionalDate(fields, "dataStartTime");
  const dataEndTime = optionalDate(fields, "dataEndTime");
  return {
    ...(dataStartTime ? { dataStartTime } : {}),
    ...(dataEndTime ? { dataEndTime } : {}),
  };
}

function requireConfirmation(fields: Fields) {
  if (!booleanField(fields, "confirmed")) throw new SpApiError("Confirm this Amazon write operation before running it", 400);
}

function parseItems(value: string, max = 2000) {
  const items = value.split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [msku, quantityRaw, prepOwner = "SELLER", labelOwner = "SELLER"] = line.split(",").map((part) => part.trim());
    const quantity = Number(quantityRaw);
    if (!msku || !Number.isInteger(quantity) || quantity < 1 || quantity > 500000) throw new SpApiError("Each item must use: MSKU, quantity, prep owner, label owner", 400);
    if (!["AMAZON", "SELLER", "NONE"].includes(prepOwner)) throw new SpApiError("Prep owner must be AMAZON, SELLER, or NONE", 400);
    if (!["AMAZON", "SELLER", "NONE"].includes(labelOwner)) throw new SpApiError("Label owner must be AMAZON, SELLER, or NONE", 400);
    return { msku, quantity, prepOwner, labelOwner };
  });
  if (items.length === 0) throw new SpApiError("Add at least one item", 400);
  if (items.length > max) throw new SpApiError("This operation accepts at most " + max + " items", 400);
  return items;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}
