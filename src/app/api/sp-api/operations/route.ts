import { getMarketplace } from "@/lib/marketplaces";
import { operationRequestSchema } from "@/lib/schemas";
import { callSpApi, privateHeaders, SpApiError, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

const coreOrderData = [
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

function orderIncludedData(fields: Fields) {
  return booleanField(fields, "includeOrderPii")
    ? ["BUYER", "RECIPIENT", coreOrderData].join(",")
    : coreOrderData;
}

const sandboxOrderData = [
  "BUYER",
  "RECIPIENT",
  "PROCEEDS",
  "EXPENSE",
  "PROMOTION",
  "CANCELLATION",
  "FULFILLMENT",
  "PACKAGES",
].join(",");

const documentPreviewLimit = 2 * 1024 * 1024;

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
        if (input.environment === "sandbox") {
          const params = new URLSearchParams({
            createdAfter: "2024-12-25T00:00:00Z",
            marketplaceIds: "A1VC38T7YXB528",
            includedData: sandboxOrderData,
          });
          result = await call(input, "/orders/2026-01-01/orders?" + params);
          break;
        }

        const createdAfter = dateField(fields, "createdAfter");
        const createdBefore = optionalDate(fields, "createdBefore");
        validateCreatedOrderWindow(createdAfter, createdBefore);

        const params = new URLSearchParams({
          marketplaceIds: input.marketplaceId,
          createdAfter,
          maxResultsPerPage: String(numberField(fields, "pageSize", 1, 100, 50)),
          includedData: orderIncludedData(fields),
        });
        addOptional(params, "createdBefore", createdBefore);
        addCsv(params, "fulfillmentStatuses", optionalString(fields, "statuses"), 7);
        addCsv(params, "fulfilledBy", optionalString(fields, "fulfilledBy"), 2);
        addOptional(params, "paginationToken", optionalString(fields, "orderPaginationToken"));
        result = await call(input, "/orders/2026-01-01/orders?" + params);
        break;
      }

      case "order": {
        const orderId = input.environment === "sandbox" ? "171-9876543-2109876" : stringField(fields, "orderId");
        const includedData = input.environment === "sandbox" ? sandboxOrderData : orderIncludedData(fields);
        result = await call(input, "/orders/2026-01-01/orders/" + encodeURIComponent(orderId) + "?includedData=" + encodeURIComponent(includedData));
        break;
      }

      case "reports": {
        if (input.environment === "sandbox") {
          const params = new URLSearchParams({
            reportTypes: "FEE_DISCOUNTS_REPORT,GET_AFN_INVENTORY_DATA",
            processingStatuses: "IN_QUEUE,IN_PROGRESS",
          });
          result = await call(input, "/reports/2021-06-30/reports?" + params);
          break;
        }

        const nextToken = optionalString(fields, "reportNextToken");
        const params = nextToken
          ? new URLSearchParams({ nextToken })
          : new URLSearchParams({
              marketplaceIds: input.marketplaceId,
              pageSize: String(numberField(fields, "pageSize", 1, 100, 20)),
            });

        if (!nextToken) {
          addCsv(params, "reportTypes", optionalString(fields, "reportTypes"), 10);
          addCsv(params, "processingStatuses", optionalString(fields, "processingStatuses"), 5);
          addOptional(params, "createdSince", optionalDate(fields, "createdSince"));
          addOptional(params, "createdUntil", optionalDate(fields, "createdUntil"));
        }
        result = await call(input, "/reports/2021-06-30/reports?" + params);
        break;
      }

      case "createReport": {
        requireConfirmation(fields);

        if (input.environment === "sandbox") {
          result = await call(input, "/reports/2021-06-30/reports", "POST", {
            reportType: "GET_MERCHANT_LISTINGS_ALL_DATA",
            dataStartTime: "2024-03-10T20:11:24.000Z",
            marketplaceIds: ["A1PA6795UKMFR9", "ATVPDKIKX0DER"],
          });
          break;
        }

        const range = optionalDateRange(fields);
        validateOptionalRange(range.dataStartTime, range.dataEndTime, "dataStartTime", "dataEndTime");
        result = await call(input, "/reports/2021-06-30/reports", "POST", {
          reportType: stringField(fields, "reportType"),
          marketplaceIds: [input.marketplaceId],
          ...range,
        });
        break;
      }

      case "report": {
        const reportId = input.environment === "sandbox" ? "ID323" : stringField(fields, "reportId");
        result = await call(input, "/reports/2021-06-30/reports/" + encodeURIComponent(reportId));
        break;
      }

      case "reportDocument": {
        const reportDocumentId = input.environment === "sandbox"
          ? "0356cf79-b8b0-4226-b4b9-0ee058ea5760"
          : stringField(fields, "reportDocumentId");
        const suffix = input.environment === "sandbox" ? "" : "?enableContentEncodingUrlHeader=true";
        result = await getAndDownloadDocument(
          input,
          "/reports/2021-06-30/documents/" + encodeURIComponent(reportDocumentId) + suffix,
          "report document",
        );
        break;
      }

      case "feeds": {
        if (input.environment === "sandbox") {
          const params = new URLSearchParams({
            feedTypes: "POST_PRODUCT_DATA",
            processingStatuses: "CANCELLED,DONE",
            pageSize: "10",
          });
          result = await call(input, "/feeds/2021-06-30/feeds?" + params);
          break;
        }

        const nextToken = optionalString(fields, "feedNextToken");
        const params = nextToken
          ? new URLSearchParams({ nextToken })
          : new URLSearchParams({
              marketplaceIds: input.marketplaceId,
              pageSize: String(numberField(fields, "pageSize", 1, 100, 20)),
            });

        if (!nextToken) {
          addCsv(params, "feedTypes", optionalString(fields, "feedTypes"), 10);
          addCsv(params, "processingStatuses", optionalString(fields, "processingStatuses"), 5);
          addOptional(params, "createdSince", optionalDate(fields, "createdSince"));
          addOptional(params, "createdUntil", optionalDate(fields, "createdUntil"));
        }
        result = await call(input, "/feeds/2021-06-30/feeds?" + params);
        break;
      }

      case "feed": {
        const feedId = input.environment === "sandbox" ? "feedId1" : stringField(fields, "feedId");
        result = await call(input, "/feeds/2021-06-30/feeds/" + encodeURIComponent(feedId));
        break;
      }

      case "feedDocument": {
        const feedDocumentId = input.environment === "sandbox"
          ? "0356cf79-b8b0-4226-b4b9-0ee058ea5760"
          : stringField(fields, "feedDocumentId");
        const suffix = input.environment === "sandbox" ? "" : "?enableContentEncodingUrlHeader=true";
        result = await getAndDownloadDocument(
          input,
          "/feeds/2021-06-30/documents/" + encodeURIComponent(feedDocumentId) + suffix,
          "feed processing report",
        );
        break;
      }

      case "submitFeed":
        requireConfirmation(fields);
        result = await submitFeed(input, fields);
        break;

      case "inboundPlans": {
        const params = input.environment === "sandbox"
          ? new URLSearchParams({
              status: "ACTIVE",
              sortBy: "LAST_UPDATED_TIME",
              sortOrder: "ASC",
              pageSize: "2",
              paginationToken: "paginationToken",
            })
          : new URLSearchParams({
              pageSize: String(numberField(fields, "pageSize", 1, 30, 10)),
              sortBy: optionalString(fields, "sortBy") || "LAST_UPDATED_TIME",
              sortOrder: optionalString(fields, "sortOrder") || "DESC",
            });
        if (input.environment !== "sandbox") {
          addOptional(params, "status", optionalString(fields, "status"));
          addOptional(params, "paginationToken", optionalString(fields, "inboundPaginationToken"));
        }
        result = await call(input, "/inbound/fba/2024-03-20/inboundPlans?" + params);
        break;
      }

      case "inboundPlan": {
        const inboundPlanId = input.environment === "sandbox"
          ? "wf1234abcd-1234-abcd-5678-1234abcd5678"
          : stringField(fields, "inboundPlanId");
        result = await call(input, "/inbound/fba/2024-03-20/inboundPlans/" + encodeURIComponent(inboundPlanId));
        break;
      }

      case "inboundShipment": {
        const inboundPlanId = input.environment === "sandbox"
          ? "wf1234abcd-1234-abcd-5678-1234abcd5678"
          : stringField(fields, "inboundPlanId");
        const shipmentId = input.environment === "sandbox"
          ? "sh1234abcd-1234-abcd-5678-1234abcd5678"
          : stringField(fields, "shipmentId");
        result = await call(input, "/inbound/fba/2024-03-20/inboundPlans/" + encodeURIComponent(inboundPlanId) + "/shipments/" + encodeURIComponent(shipmentId));
        break;
      }

      case "inboundOperationStatus": {
        const operationId = input.environment === "sandbox"
          ? "1234abcd-1234-abcd-5678-1234abcd5678"
          : stringField(fields, "operationId");
        result = await call(input, "/inbound/fba/2024-03-20/operations/" + encodeURIComponent(operationId));
        break;
      }

      case "prepDetails": {
        const params = new URLSearchParams({
          marketplaceId: input.environment === "sandbox" ? "ATVPDKIKX0DER" : input.marketplaceId,
        });
        if (input.environment === "sandbox") {
          params.append("mskus", "msku1");
          params.append("mskus", "msku2");
        } else {
          addPrepMskus(params, stringField(fields, "mskus"), 100);
        }
        result = await call(input, "/inbound/fba/2024-03-20/items/prepDetails?" + params);
        break;
      }

      case "createInboundPlan": {
        requireConfirmation(fields);

        if (input.environment === "sandbox") {
          result = await call(input, "/inbound/fba/2024-03-20/inboundPlans", "POST", {
            name: "FBA (03/20/2024, 12:01 PM)",
            sourceAddress: {
              name: "name",
              companyName: "Acme",
              addressLine1: "123 example street",
              addressLine2: "Unit 102",
              city: "Toronto",
              countryCode: "CA",
              stateOrProvinceCode: "ON",
              postalCode: "M1M1M1",
              phoneNumber: "1234567890",
              email: "email@email.com",
            },
            destinationMarketplaces: ["A2EUQ1WTGCTBG2"],
            items: [{
              msku: "msku",
              prepOwner: "AMAZON",
              labelOwner: "AMAZON",
              quantity: 2,
              expiration: "2024-01-01",
              manufacturingLotCode: "lotCode",
            }],
          });
          break;
        }

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
          items: parseItems(stringField(fields, "items"), 2000),
        });
        break;
      }

      case "itemLabels": {
        if (input.environment === "sandbox") {
          result = await call(input, "/inbound/fba/2024-03-20/items/labels", "POST", {
            marketplaceId: "ATVPDKIKX0DER",
            mskuQuantities: [
              { msku: "msku1", quantity: 1 },
              { msku: "msku2", quantity: 1 },
            ],
            labelType: "STANDARD_FORMAT",
            pageType: "A4_21",
            localeCode: "en_US",
          });
          break;
        }

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
        if (input.environment === "sandbox") {
          const params = new URLSearchParams({
            PageType: "PackageLabel_Letter_2",
            LabelType: "BARCODE_2D",
          });
          result = await call(input, "/fba/inbound/v0/shipments/348975493/labels?" + params);
          break;
        }

        const shipmentId = stringField(fields, "shipmentId");
        const labelType = optionalString(fields, "shipmentLabelType") || "UNIQUE";
        const numberOfPallets = optionalIntegerField(fields, "numberOfPallets", 1);
        if (labelType === "PALLET" && !numberOfPallets) {
          throw new SpApiError("numberOfPallets is required for PALLET labels", 400, null, "MISSING_NUMBER_OF_PALLETS");
        }

        const params = new URLSearchParams({
          PageType: optionalString(fields, "shipmentPageType") || "PackageLabel_Thermal_NonPCP",
          LabelType: labelType,
        });
        addOptional(params, "NumberOfPackages", optionalIntegerField(fields, "numberOfPackages", 1));
        addOptional(params, "NumberOfPallets", numberOfPallets);
        addOptional(params, "PageSize", optionalIntegerField(fields, "shipmentPageSize", 1));
        addOptional(params, "PageStartIndex", optionalIntegerField(fields, "pageStartIndex", 0));
        addCsv(params, "PackageLabelsToPrint", optionalString(fields, "packageLabelsToPrint"), 1000);
        result = await call(input, "/fba/inbound/v0/shipments/" + encodeURIComponent(shipmentId) + "/labels?" + params);
        break;
      }

      case "billOfLading": {
        const shipmentId = input.environment === "sandbox" ? "shipmentId" : stringField(fields, "shipmentId");
        result = await call(input, "/fba/inbound/v0/shipments/" + encodeURIComponent(shipmentId) + "/billOfLading");
        break;
      }
    }

    result = applyBusinessOutcome(input, result);
    return Response.json(result, { status: result.ok ? 200 : result.status, headers: privateHeaders });
  } catch (error) {
    return toErrorResponse(error);
  }
}

type Input = ReturnType<typeof operationRequestSchema.parse>;
type Fields = Record<string, unknown>;
type CallResult = Awaited<ReturnType<typeof call>>;

function call(input: Input, path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  return callSpApi({
    credentials: input,
    marketplaceId: input.marketplaceId,
    environment: input.environment,
    path,
    method,
    body,
  });
}

async function submitFeed(input: Input, fields: Fields) {
  if (input.environment === "sandbox") {
    const document = await call(input, "/feeds/2021-06-30/documents", "POST", {
      contentType: "text/tab-separated-values; charset=UTF-8",
    });
    if (!document.ok) return document;

    const documentData = record(document.data);
    const feedDocumentId = typeof documentData.feedDocumentId === "string"
      ? documentData.feedDocumentId
      : "3d4e42b5-1d6e-44e8-a89c-2abfca0625bb";

    const created = await call(input, "/feeds/2021-06-30/feeds", "POST", {
      feedType: "POST_PRODUCT_DATA",
      marketplaceIds: ["ATVPDKIKX0DER", "A1F83G8C2ARO7P"],
      inputFeedDocumentId: feedDocumentId,
    });

    if (!created.ok) return created;
    return {
      ...created,
      data: {
        ...record(created.data),
        inputFeedDocumentId: feedDocumentId,
        sandboxFixture: true,
        nextStep: "Amazon static Sandbox returns feedId 3485934 for createFeed, but getFeed uses a separate feedId1 fixture. Use the workbench's Check feed status action; it switches to the correct status fixture automatically.",
      },
    };
  }

  const feedType = stringField(fields, "feedType");
  const contentType = optionalString(fields, "contentType") || "application/json; charset=UTF-8";
  const content = stringField(fields, "content");

  if (feedType === "JSON_LISTINGS_FEED") {
    validateJsonListingsFeed(contentType, content);
  }

  const document = await call(input, "/feeds/2021-06-30/documents", "POST", { contentType });
  if (!document.ok) return document;

  const documentData = record(document.data);
  const url = typeof documentData.url === "string" ? documentData.url : "";
  const feedDocumentId = typeof documentData.feedDocumentId === "string" ? documentData.feedDocumentId : "";
  if (!url || !feedDocumentId) {
    throw new SpApiError("Amazon did not return a feed upload URL and document ID", 502, document.data, "FEED_UPLOAD_URL_MISSING");
  }

  if (Buffer.byteLength(content, "utf8") > 5 * 1024 * 1024) {
    throw new SpApiError("Feed content is limited to 5 MB in this workbench", 413, null, "FEED_TOO_LARGE");
  }

  const uploadUrl = safeAmazonDocumentUrl(url, "feed upload");
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: content,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!upload.ok) {
    throw new SpApiError(
      `Amazon feed document upload failed with HTTP ${upload.status}`,
      upload.status,
      { statusText: upload.statusText },
      "FEED_DOCUMENT_UPLOAD_FAILED",
    );
  }

  const created = await call(input, "/feeds/2021-06-30/feeds", "POST", {
    feedType,
    marketplaceIds: [input.marketplaceId],
    inputFeedDocumentId: feedDocumentId,
  });

  if (!created.ok) return created;
  return {
    ...created,
    data: {
      ...record(created.data),
      inputFeedDocumentId: feedDocumentId,
      verification: "Poll Feed status until DONE or FATAL. When DONE, use resultFeedDocumentId with Feed processing report to inspect record-level errors.",
    },
  };
}

async function getAndDownloadDocument(input: Input, path: string, label: string): Promise<CallResult> {
  const metadata = await call(input, path);
  if (!metadata.ok) return metadata;

  const document = record(metadata.data);
  const url = typeof document.url === "string" ? document.url : "";
  if (!url) {
    throw new SpApiError(`Amazon returned no URL for the ${label}`, 502, metadata.data, "DOCUMENT_URL_MISSING");
  }

  const downloadUrl = safeAmazonDocumentUrl(url, label);

  try {
    const download = await fetch(downloadUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!download.ok) {
      return {
        ...metadata,
        data: {
          ...document,
          downloaded: {
            contentType: null,
            bytesRead: 0,
            truncated: false,
            content: "",
            error: `Server-side preview failed with HTTP ${download.status} ${download.statusText}. The original Amazon URL is still available below.`,
          },
        },
      };
    }

    const preview = await readTextPreview(download, documentPreviewLimit);
    return {
      ...metadata,
      data: {
        ...document,
        downloaded: {
          contentType: download.headers.get("content-type"),
          contentDisposition: download.headers.get("content-disposition"),
          bytesRead: preview.bytesRead,
          truncated: preview.truncated,
          content: preview.text,
          error: null,
        },
      },
    };
  } catch (error) {
    return {
      ...metadata,
      data: {
        ...document,
        downloaded: {
          contentType: null,
          bytesRead: 0,
          truncated: false,
          content: "",
          error: error instanceof Error
            ? "Server-side preview failed: " + error.message + ". The original Amazon URL is still available below."
            : "Server-side preview failed. The original Amazon URL is still available below.",
        },
      },
    };
  }
}

async function readTextPreview(response: Response, maxBytes: number) {
  if (!response.body) return { text: "", bytesRead: 0, truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - bytesRead;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    bytesRead += chunk.byteLength;
    if (value.byteLength > remaining) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  const merged = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder("utf-8", { fatal: false }).decode(merged),
    bytesRead,
    truncated,
  };
}

function safeAmazonDocumentUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SpApiError(`Amazon returned an invalid URL for the ${label}`, 502, { url: value }, "INVALID_DOCUMENT_URL");
  }

  const host = url.hostname.toLowerCase();
  const allowedHost =
    host === "amazonaws.com" ||
    host.endsWith(".amazonaws.com") ||
    host === "cloudfront.net" ||
    host.endsWith(".cloudfront.net");

  if (url.protocol !== "https:" || !allowedHost) {
    throw new SpApiError(
      `Amazon returned an unexpected host for the ${label}`,
      502,
      { host: url.hostname },
      "UNEXPECTED_DOCUMENT_HOST",
    );
  }
  return url;
}

function validateCreatedOrderWindow(createdAfter: string, createdBefore: string) {
  if (!createdBefore) return;
  const after = new Date(createdAfter).getTime();
  const before = new Date(createdBefore).getTime();
  if (before < after) {
    throw new SpApiError("createdBefore must be equal to or after createdAfter", 400, null, "INVALID_ORDER_DATE_RANGE");
  }
  if (before > Date.now() - 2 * 60 * 1000) {
    throw new SpApiError("createdBefore must be at least two minutes before the request time", 400, null, "ORDER_CREATED_BEFORE_TOO_RECENT");
  }
}

function validateOptionalRange(start: string | undefined, end: string | undefined, startLabel: string, endLabel: string) {
  if (!start || !end) return;
  if (new Date(end).getTime() < new Date(start).getTime()) {
    throw new SpApiError(`${endLabel} must be equal to or after ${startLabel}`, 400, null, "INVALID_DATE_RANGE");
  }
}

function applyBusinessOutcome(input: Input, result: CallResult): CallResult {
  const operation = input.operation;
  if (!result.ok) return result;

  const data = record(result.data);

  if (operation === "feed") {
    const processingStatus = typeof data.processingStatus === "string" ? data.processingStatus : "";

    if (input.environment === "sandbox" && processingStatus === "CANCELLED") {
      return {
        ...result,
        data: {
          ...data,
          sandboxFixture: true,
          nextStep: "Amazon's static getFeed fixture intentionally returns CANCELLED. This validates status handling; use Feed processing report to open the separate sandbox document fixture.",
        },
      };
    }

    if (processingStatus === "FATAL" || processingStatus === "CANCELLED") {
      return {
        ...result,
        ok: false,
        status: 422,
        statusText: "Feed processing " + processingStatus.toLowerCase(),
        problem: {
          code: "FEED_" + processingStatus,
          message: processingStatus === "FATAL"
            ? "Amazon aborted the feed during processing. Some records may or may not have been applied."
            : "Amazon cancelled the feed before processing completed.",
          details: typeof data.resultFeedDocumentId === "string"
            ? "resultFeedDocumentId: " + data.resultFeedDocumentId
            : null,
          action: typeof data.resultFeedDocumentId === "string"
            ? "Open Feed processing report with the returned resultFeedDocumentId, fix every reported record error, then submit a corrected feed."
            : "Review the feed inputs and submit a new feed only after the underlying cause is understood.",
          retryable: false,
        },
      };
    }
    if (processingStatus === "DONE") {
      return {
        ...result,
        data: {
          ...data,
          nextStep: typeof data.resultFeedDocumentId === "string"
            ? "Use Feed processing report with resultFeedDocumentId before treating individual records as successful."
            : "Feed processing is DONE. Confirm the response contains a resultFeedDocumentId and inspect the processing report when available.",
        },
      };
    }
    if (processingStatus === "IN_QUEUE" || processingStatus === "IN_PROGRESS") {
      return {
        ...result,
        data: { ...data, nextStep: "The feed is still processing. Poll Feed status again later; do not resubmit the same feed just because it is still pending." },
      };
    }
  }

  if (operation === "report") {
    const processingStatus = typeof data.processingStatus === "string" ? data.processingStatus : "";
    if (processingStatus === "FATAL" || processingStatus === "CANCELLED") {
      return {
        ...result,
        ok: false,
        status: 422,
        statusText: "Report processing " + processingStatus.toLowerCase(),
        problem: {
          code: "REPORT_" + processingStatus,
          message: processingStatus === "FATAL"
            ? "Amazon could not complete the report job."
            : "The report job was cancelled.",
          details: typeof data.reportId === "string" ? "reportId: " + data.reportId : null,
          action: "Verify the report type, requested date range, marketplace, and required role. Create a new report only after correcting the cause.",
          retryable: false,
        },
      };
    }
    if (processingStatus === "DONE") {
      return {
        ...result,
        data: {
          ...data,
          nextStep: typeof data.reportDocumentId === "string"
            ? "Use Report document with reportDocumentId to download and inspect the generated report."
            : "Report processing is DONE. Confirm Amazon returned reportDocumentId before attempting a download.",
        },
      };
    }
    if (processingStatus === "IN_QUEUE" || processingStatus === "IN_PROGRESS") {
      return {
        ...result,
        data: { ...data, nextStep: "The report is still processing. Poll Report status again later instead of creating a duplicate report." },
      };
    }
  }

  if (operation === "inboundOperationStatus") {
    const operationStatus = typeof data.operationStatus === "string" ? data.operationStatus : "";
    const problems = Array.isArray(data.operationProblems) ? data.operationProblems.filter((item) => typeof item === "object" && item !== null) : [];
    const firstProblem = record(problems[0]);

    if (operationStatus === "FAILED") {
      const code = typeof firstProblem.code === "string" ? firstProblem.code : "INBOUND_OPERATION_FAILED";
      const message = typeof firstProblem.message === "string"
        ? firstProblem.message
        : "The asynchronous Fulfillment Inbound operation finished in a failed state.";
      const details = problems.length ? JSON.stringify(problems) : null;
      return {
        ...result,
        ok: false,
        status: 422,
        statusText: "Inbound operation failed",
        problem: {
          code,
          message,
          details,
          action: "Read every operationProblem, correct the inbound plan/item/shipment data it identifies, then start a new valid operation. Do not assume the original write was applied.",
          retryable: false,
        },
      };
    }

    if (operationStatus === "IN_PROGRESS") {
      return {
        ...result,
        data: { ...data, nextStep: "This operation has not finished yet. Poll Operation status again before continuing to dependent inbound workflow steps." },
      };
    }

    if (operationStatus === "SUCCESS" && problems.length) {
      return {
        ...result,
        data: {
          ...data,
          businessWarnings: problems,
          nextStep: "The operation succeeded, but Amazon returned warnings. Review operationProblems before continuing.",
        },
      };
    }
  }

  if (operation === "createInboundPlan" && typeof data.operationId === "string") {
    return {
      ...result,
      data: {
        ...data,
        nextStep: "Use Operation status with operationId and wait for SUCCESS before continuing with dependent inbound workflow steps.",
      },
    };
  }

  if (operation === "createReport" && typeof data.reportId === "string") {
    return {
      ...result,
      data: {
        ...data,
        nextStep: "Poll Report status with reportId until DONE, FATAL, or CANCELLED. Download the report only after DONE.",
      },
    };
  }

  if (operation === "submitFeed" && typeof data.feedId === "string") {
    return {
      ...result,
      data: {
        ...data,
        nextStep: "Poll Feed status with feedId until DONE, FATAL, or CANCELLED. When DONE, open resultFeedDocumentId to verify record-level processing.",
      },
    };
  }

  if (operation === "itemLabels") {
    return {
      ...result,
      data: {
        ...data,
        nextStep: "Use the returned documentDownloads URL to open or download the generated item-label file before it expires.",
      },
    };
  }

  if (operation === "shipmentLabels" || operation === "billOfLading") {
    return {
      ...result,
      data: {
        ...data,
        nextStep: "Use Amazon's returned DownloadURL to open or download the generated document before the URL expires.",
      },
    };
  }

  return result;
}

function stringField(fields: Fields, key: string) {
  const value = fields[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new SpApiError(key + " is required", 400, null, "MISSING_REQUIRED_FIELD");
  }
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
  if (Number.isNaN(date.getTime())) throw new SpApiError(key + " must be a valid date", 400, null, "INVALID_DATE");
  return date.toISOString();
}

function optionalDate(fields: Fields, key: string) {
  const value = optionalString(fields, key);
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new SpApiError(key + " must be a valid date", 400, null, "INVALID_DATE");
  return date.toISOString();
}

function numberField(fields: Fields, key: string, min: number, max: number, fallback: number) {
  const raw = fields[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new SpApiError(key + " must be between " + min + " and " + max, 400, null, "INVALID_NUMBER");
  }
  return value;
}

function optionalIntegerField(fields: Fields, key: string, min: number) {
  const raw = optionalString(fields, key);
  if (!raw) return "";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new SpApiError(key + " must be an integer of at least " + min, 400, null, "INVALID_NUMBER");
  }
  return String(value);
}

function addOptional(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
}

function addCsv(params: URLSearchParams, key: string, value: string, max: number, repeated = false) {
  if (!value) return;
  const values = value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
  if (values.length > max) throw new SpApiError(key + " accepts at most " + max + " values", 400, null, "TOO_MANY_VALUES");
  if (repeated) values.forEach((entry) => params.append(key, entry));
  else params.set(key, values.join(","));
}

function addPrepMskus(params: URLSearchParams, value: string, max: number) {
  // One MSKU per line: commas are valid MSKU characters and must not be treated as separators.
  const values = value.split(/\n/).map((entry) => entry.trim()).filter(Boolean);
  if (values.length > max) throw new SpApiError("mskus accepts at most " + max + " values", 400, null, "TOO_MANY_VALUES");
  for (const msku of values) params.append("mskus", preEncodePrepMsku(msku));
}

function preEncodePrepMsku(value: string) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("+", "%2B")
    .replaceAll(",", "%2C");
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
  if (!booleanField(fields, "confirmed")) {
    throw new SpApiError("Confirm this Amazon write operation before running it", 400, null, "WRITE_CONFIRMATION_REQUIRED");
  }
}

function parseItems(value: string, max = 2000) {
  const items = value.split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [msku, quantityRaw, prepOwner = "SELLER", labelOwner = "SELLER"] = line.split(",").map((part) => part.trim());
    const quantity = Number(quantityRaw);
    if (!msku || !Number.isInteger(quantity) || quantity < 1 || quantity > 500000) {
      throw new SpApiError("Each item must use: MSKU, quantity, prep owner, label owner", 400, null, "INVALID_ITEM_ROW");
    }
    if (!["AMAZON", "SELLER", "NONE"].includes(prepOwner)) {
      throw new SpApiError("Prep owner must be AMAZON, SELLER, or NONE", 400, null, "INVALID_PREP_OWNER");
    }
    if (!["AMAZON", "SELLER", "NONE"].includes(labelOwner)) {
      throw new SpApiError("Label owner must be AMAZON, SELLER, or NONE", 400, null, "INVALID_LABEL_OWNER");
    }
    return { msku, quantity, prepOwner, labelOwner };
  });
  if (items.length === 0) throw new SpApiError("Add at least one item", 400, null, "NO_ITEMS");
  if (items.length > max) throw new SpApiError("This operation accepts at most " + max + " items", 400, null, "TOO_MANY_ITEMS");
  return items;
}


function validateJsonListingsFeed(contentType: string, content: string) {
  if (!/^application\/json\b/i.test(contentType.trim())) {
    throw new SpApiError(
      "JSON_LISTINGS_FEED requires an application/json content type",
      400,
      { contentType },
      "INVALID_JSON_LISTINGS_CONTENT_TYPE",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new SpApiError(
      "Feed content is not valid JSON",
      400,
      { cause: error instanceof Error ? error.message : String(error) },
      "INVALID_FEED_JSON",
    );
  }

  const feed = record(parsed);
  const header = record(feed.header);
  const sellerId = typeof header.sellerId === "string" ? header.sellerId.trim() : "";
  const version = typeof header.version === "string" ? header.version.trim() : "";
  const messages = Array.isArray(feed.messages) ? feed.messages : [];

  if (!sellerId || !version || messages.length === 0) {
    throw new SpApiError(
      "JSON_LISTINGS_FEED requires header.sellerId, header.version, and at least one message",
      400,
      {
        hasSellerId: Boolean(sellerId),
        hasVersion: Boolean(version),
        messageCount: messages.length,
      },
      "INVALID_JSON_LISTINGS_STRUCTURE",
    );
  }

  for (const [index, rawMessage] of messages.entries()) {
    const message = record(rawMessage);
    const messageId = message.messageId;
    const sku = typeof message.sku === "string" ? message.sku.trim() : "";
    const operationType = typeof message.operationType === "string" ? message.operationType.trim() : "";
    if (!Number.isInteger(messageId) || Number(messageId) < 1 || !sku || !operationType) {
      throw new SpApiError(
        "Each JSON listings message requires a positive integer messageId, sku, and operationType",
        400,
        { messageIndex: index, messageId, sku, operationType },
        "INVALID_JSON_LISTINGS_MESSAGE",
      );
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}
