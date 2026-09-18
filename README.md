# SP-API Workbench

A local workbench for testing Amazon Selling Partner API credentials and running the product, inventory, order, report, feed, and FBA inbound workflows found in the original `FbaFees` desktop project.

## Included tools

- LWA + SP-API connection test (`client_id`, `client_secret`, `refresh_token`, environment, and marketplace)
- Catalog Items API `2022-04-01`
- ASIN, UPC, EAN, GTIN, ISBN, JAN, MINSAN, SKU, and keyword searches
- Exact-ASIN lookup with every Catalog Items dataset and recursive variation/package-family retrieval
- Structured catalogue results with all returned images plus complete raw JSON
- Product Fees API v0 estimates for ASINs and seller SKUs
- FBA inventory summaries
- Order search and full order retrieval using Orders API `2026-01-01`; core datasets are requested by default and buyer/recipient PII is opt-in when the app has the required roles
- Report listing, creation, status, and document URL retrieval
- Feed listing, status, document upload/submission, and processing-report download
- FBA inbound plan, shipment, prep, plan creation, asynchronous operation-status verification, and item-label tools using Fulfillment Inbound `2024-03-20`
- Marketplace-aware endpoints, currencies, and locales
- Amazon request ID, rate-limit, duration, and HTTP status inspection

Amazon write operations are clearly marked and require an explicit confirmation before each run.

## Connected endpoint coverage

Every non-legacy button visible in the workbench is connected to a current Amazon operation. The method and path mapping was audited against Amazon's official `selling-partner-api-models` repository at commit `3659f96867bfc669aca7a524c2f95744ff0e4478` (2026-08-26).

| Area | Connected operations |
| --- | --- |
| Authentication | LWA refresh-token exchange at `POST /auth/o2/token` |
| Catalogue | `GET /catalog/2022-04-01/items/{asin}` and `GET /catalog/2022-04-01/items` |
| Fees | `POST /products/fees/v0/items/{asin}/feesEstimate` and `POST /products/fees/v0/listings/{sellerSku}/feesEstimate` |
| Inventory | `GET /fba/inventory/v1/summaries` |
| Orders | `GET /orders/2026-01-01/orders` and `GET /orders/2026-01-01/orders/{orderId}` |
| Reports | List, create, inspect, and retrieve document URL under `/reports/2021-06-30` |
| Feeds | List, inspect, create document, upload to Amazon's validated S3 URL, and create feed under `/feeds/2021-06-30` |
| FBA inbound | List/get/create plans, get shipment, prep details, and item labels under `/inbound/fba/2024-03-20` |
| FBA documents | Shipment labels and bill of lading under `/fba/inbound/v0` (still present in Amazon's current model) |

Catalogue calls request all ten datasets Amazon exposes: attributes, classifications, dimensions, identifiers, images, product types, relationships, sales ranks, summaries, and vendor details. For one exact ASIN, the default option follows both variation and package relationships until all discoverable related ASIN records have been requested. Keyword searches remain paginated because automatically crawling an unbounded search could return thousands of unrelated products; the next-page token is visible in the form and raw response.

This is endpoint coverage for the operations represented by the original `FbaFees` utility and this workbench, not every API in the full Amazon SP-API catalog. The current staged inbound workflow has many additional packing, placement, delivery, and transportation endpoints that the old desktop utility did not expose as standalone tools.

## Legacy boundaries

The desktop app's `Convert Amazon_US` and `SKU / FC bulk update` buttons are not SP-API operations. They depend on private SQL Server tables and company-specific rules (`SkuType`, fulfillment-centre tables, and the old FTS connection). The new interface identifies them, but they cannot run until that database schema and a safe connection method are supplied.

The old buttons are represented as follows:

| Desktop capability | New workbench operation |
| --- | --- |
| Start Run / fee estimate | Fee estimate |
| GetMatchingProducts | Catalogue item |
| InventorySummaries | FBA inventory |
| OrderList / OrderItem | Search orders / Get order |
| Reports | List, request, inspect, and download reports |
| Feed | List, inspect, and submit feeds |
| Shipments / shipment info | List plans / Get plan / Get shipment |
| Prep instructions | Prep details |
| Create shipment plan | Create inbound plan |
| GetLabels | Shipment labels / Item labels / Bill of lading |
| Convert / FC bulk update | Shown as legacy database integrations |

## Run locally

Requirements: Node.js 24+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Changes update automatically while the development server is running.

## Verify a production build

```bash
npm run lint
npm run build
npm start
```

## Credential handling

- Amazon credentials are held only in the active browser tab.
- They are sent to this server only when a request is made.
- API responses use `Cache-Control: no-store`.
- Credentials are never returned in API responses or written by the application.
- Do not place credentials in `.env` files, source code, screenshots, URLs, or Git history.

Amazon's current standard SP-API connection flow uses Login with Amazon credentials. AWS access keys and an IAM role ARN from older SP-API integrations are not requested by this application.


## Sandbox and production safety

The workbench starts in **Sandbox** mode. Switch to **Production** only when you intentionally want to call a live seller account.

- Sandbox uses `https://sandbox.sellingpartnerapi-*.amazon.com`.
- Production uses `https://sellingpartnerapi-*.amazon.com`.
- The connection test now verifies both the LWA token exchange and a Sellers API `getMarketplaceParticipations` request.
- Amazon's static sandbox returns mocked responses by matching the request parameters in the official OpenAPI model. A valid production-shaped request is not guaranteed to match a static sandbox example.
- Production write operations still require an explicit confirmation.

## Error handling and retries

Every SP-API response records the HTTP status, Amazon request ID, applied rate limit when available, request duration, and retry attempt count. Failed responses also include a structured `problem` object:

```json
{
  "code": "Unauthorized",
  "message": "Access to requested resource is denied.",
  "details": "...",
  "action": "Verify the seller authorized this app and that the app has the Amazon role required by this operation/report. Reauthorize after changing roles.",
  "retryable": false
}
```

Transient errors use method-aware retry rules. HTTP `429` is retried with bounded backoff and the client honors `Retry-After` / `x-amzn-RateLimit-Limit` when available. Read-only GET calls can also retry transient `500`, `502`, `503`, `504`, timeout, and network failures. Write calls are **not** automatically replayed after ambiguous server/network failures because the original write may already have reached Amazon; the workbench tells you to verify the related resource/job state before resubmitting. All SP-API calls include the current `x-amz-date` header.

## Connected result workflows

The workbench renders the useful Amazon response fields directly in the Result panel instead of requiring IDs to be copied out of raw JSON.

- **Reports:** request → report ID → status → report document ID → document preview/open link.
- **Feeds:** submit → feed ID → status → result feed document ID → processing report.
- **FBA inbound:** create plan → operation ID → operation status → inbound plan → shipment → shipment labels or bill of lading.
- **Orders:** search results can be opened as an individual order.
- **Inventory and prep:** returned records render as tables.
- **Documents:** report/feed documents get a bounded text preview when possible and always preserve Amazon's original presigned URL. Item labels, shipment labels, and bills of lading expose Amazon's returned download URL.

Amazon's **static** sandbox examples are independent fixtures, so an ID returned by one static example does not always feed into the next example. In Sandbox mode the workbench substitutes the exact fixture required by the selected follow-up operation and explains that behavior in the Result panel. Production does not do this: it passes Amazon's real returned report IDs, feed IDs, document IDs, inbound plan IDs, operation IDs, and shipment IDs into the next operation.

FBA Inventory is different: Amazon currently marks `GET /fba/inventory/v1/summaries` as a **dynamic sandbox** operation. Its results depend on inventory state created in the sandbox, so an empty inventory response is valid and is not replaced with fabricated static data.
## Response matrix

Every workbench operation now has a visible request/response contract in the UI, a structured Result view, a complete returned-data block, and the raw transport envelope in the Response inspector.

| Workbench operation | Amazon response data | Follow-up |
| --- | --- | --- |
| Catalogue item | `items[]` or an `Item` with datasets such as images, identifiers, dimensions, relationships, ranks, summaries and attributes | Use `pagination.nextToken` for additional search pages; exact ASIN mode can follow related ASINs |
| Fee estimate | `payload.FeesEstimateResult` with status, identifier, total and `FeeDetailList` | Embedded `ClientError` / `ServiceError` is treated as a real failure |
| FBA inventory | `payload.inventorySummaries[]` plus `pagination.nextToken` | Continue with the next token; quantity details are flattened into the Result table |
| Search orders | `orders[]` plus `pagination.nextToken` | Open an `orderId` or continue to the next page |
| Get order | `order` with items and any requested buyer, recipient, proceeds, payment, tax, fulfillment, packages and fulfillment-order data | Inspect the complete returned data in Result |
| List reports | `reports[]` plus root `nextToken` | Open `reportId`; next-token calls use only `nextToken` |
| Request report | `reportId` | Poll Report status |
| Report status | processing state plus `reportDocumentId` when DONE | Retrieve Report document |
| Report document | `reportDocumentId`, presigned `url`, optional compression metadata, plus the workbench download preview | Open/download the original Amazon document |
| List feeds | `feeds[]` plus root `nextToken` | Open `feedId`; next-token calls use only `nextToken` |
| Submit feed | feed-document creation/upload followed by `feedId` | Poll Feed status |
| Feed status | processing state plus `resultFeedDocumentId` when available | Inspect the processing report, even after DONE |
| Feed processing report | document metadata + presigned URL + downloaded text preview when available | Correct record-level errors before resubmitting |
| List inbound plans | `inboundPlans[]` plus `pagination.nextToken` | Open an inbound plan or continue pagination |
| Get inbound plan | plan metadata, source address, packing options, placement options and shipment summaries | Open a shipment |
| Get shipment | source/destination, dates, tracking, freight, transportation, delivery and contact/appointment details | Request shipment labels or bill of lading when available |
| Inbound operation status | `operationId`, operation name, `operationStatus`, `operationProblems[]` | Continue only after SUCCESS |
| Prep details | `mskuPrepDetails[]` with prep categories/types and owner constraints | Use constraints in inbound-plan item data |
| Create inbound plan | `inboundPlanId` + `operationId` | Poll operation status, then retrieve the plan |
| Item labels | `documentDownloads[]` with `uri`, `downloadType`, and expiration | Download before the URL expires |
| Shipment labels | legacy `payload.DownloadURL` | Open/download Amazon's generated document |
| Bill of lading | legacy `payload.DownloadURL` | Open/download Amazon's generated document |

**Three views are intentionally kept:** the tailored Result cards/tables for day-to-day use, **All returned data** for the complete Amazon data object, and **Response inspector** for the full transport envelope (`status`, request ID, rate limit, retries, timing, `problem`, and `data`).
## Asynchronous-result verification

An HTTP success response can mean that Amazon accepted a job, not that the job ultimately succeeded.

- **Feeds:** submit the feed, poll **Feed status**, then use `resultFeedDocumentId` with **Feed processing report** to download and inspect record-level processing results.
- **Reports:** wait for the report to reach `DONE`, then use **Report document**. The workbench downloads a bounded text preview of the presigned result URL.
- **FBA inbound:** operations such as creating an inbound plan can return an `operationId`. Use **Operation status** (`GET /inbound/fba/2024-03-20/operations/{operationId}`) and inspect `operationStatus` and `operationProblems` before treating the action as completed.

The workbench also preserves the special double-percent encoding required by `listPrepDetails` for MSKUs containing `%`, `+`, or `,`, and exposes the optional package/pagination parameters required by additional legacy `getLabels` scenarios.


## Production input checklist

Use seller-owned data from the same marketplace selected in the workbench. IDs returned by one operation should be used for the next operation in that workflow instead of made-up placeholders.

| Operation | What to enter in Production | Expected result |
| --- | --- | --- |
| Catalogue item | Real ASIN, UPC/EAN/GTIN, seller SKU + seller ID, or keywords | Product/catalogue datasets and images; keyword searches can return a next-page token |
| Fee estimate | Real ASIN or seller SKU, listing price, shipping amount, FBA/Merchant | Fee status, total estimate, and fee detail list |
| FBA inventory | Marketplace; optional seller SKUs / changed-since time | Inventory summaries and quantities; may return a short-lived next token |
| Search orders | Created-after time; optional created-before, statuses and fulfilment filter | Orders and next-page token; buyer/recipient PII is disabled by default |
| Get order | `orderId` returned by Search orders | Full core order object; optionally buyer/recipient data when PII access is enabled |
| List reports | No filter is required; optionally add report types such as `GET_MERCHANT_LISTINGS_ALL_DATA`, status, or time filters | Matching report jobs and next token |
| Request report | Supported report type; optional start/end dates where that report type accepts them | `reportId` |
| Report status | `reportId` | Processing status and `reportDocumentId` when DONE |
| Report document | `reportDocumentId` | Presigned document URL plus workbench preview when text-readable |
| List feeds | No filter is required; optionally add a feed type such as `JSON_LISTINGS_FEED`, status, or time filters | Matching feed jobs and next token |
| Feed status | `feedId` | Processing status and `resultFeedDocumentId` when Amazon produces one |
| Feed processing report | `resultFeedDocumentId` | Presigned processing-report URL and preview |
| Submit feed | `JSON_LISTINGS_FEED`, JSON content type, and a complete valid feed payload | `inputFeedDocumentId`, then `feedId`; the workbench validates the basic JSON feed structure before upload |
| List inbound plans | No filter is required; optionally add plan status/sort/page size | Inbound plans and next token |
| Get inbound plan | `inboundPlanId` returned by List/Create plan | Plan, packing/placement options and shipment summaries |
| Get shipment | `inboundPlanId` + `shipmentId` from the plan | Shipment destination, status, tracking/transportation data |
| Inbound operation status | `operationId` returned by an inbound write | SUCCESS / IN_PROGRESS / FAILED and any operation problems |
| Prep details | Real MSKUs, one per line | Prep categories/types and owner constraints |
| Create inbound plan | Real ship-from address and items as `MSKU, quantity, prepOwner, labelOwner` | `inboundPlanId` + `operationId` |
| Item labels | `MSKU, quantity` rows, label format and page type | One or more expiring document-download URLs |
| Shipment labels | Real shipment ID plus label/page type; package/pallet values when applicable | Amazon-generated label download URL |
| Bill of lading | Real eligible shipment ID | Amazon-generated bill-of-lading URL when that shipment supports one |

### Recommended first Production tests

Start with read-only operations in this order: connection test → Catalogue item → Fee estimate → FBA inventory → Search orders (PII off) → List reports → List feeds → List inbound plans. These verify credentials, roles, marketplace routing, pagination, and response rendering without creating or changing Amazon resources.

For writes, **Request report** is the safest next test because it creates a report job rather than changing a listing or shipment. Do not use **Submit feed** or **Create inbound plan** as generic connectivity tests; use them only with deliberate seller data and a payload you actually intend Amazon to process.

## API references

- [Connect to SP-API](https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api)
- [Catalog Items API](https://developer-docs.amazon.com/sp-api/reference/catalog-items-v2022-04-01)
- [Product Fees API](https://developer-docs.amazon.com/sp-api/reference/product-fees-v0)
