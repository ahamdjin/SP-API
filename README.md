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

## Install and run

### Visual Studio 2022 or newer

You need:

- Visual Studio 2022 or newer with the **Node.js development** workload.
- Node.js 24+ and npm.

Then:

1. Download or clone this repository.
2. If you downloaded a ZIP, extract it first.
3. Open `SP-API.sln`.
4. Press the green **Run / F5** button.
5. On the first run, wait while the launcher checks the npm connection and installs packages automatically.
6. The browser opens only after Next.js is ready at `http://localhost:3000`.

### Visual Studio 2019

Visual Studio 2019 uses the older Node.js project format, so use the separate VS 2019 solution included in this repository.

You need:

- Visual Studio 2019 with the **Node.js development** workload.
- Node.js 24+ and npm.

Then:

1. Download or clone this repository.
2. If you downloaded a ZIP, extract it first.
3. Open `SP-API-VS2019.sln` — do **not** open `SP-API.sln` in VS 2019.
4. Press the green **Run / F5** button.
5. On the first run, wait while npm packages are installed automatically.
6. The app will start at `http://localhost:3000`.

Both Visual Studio solutions run the same Next.js application and use the same source code.

After the first successful run, later starts should be much faster.

### Run from a terminal

Open a terminal in the project folder and run:

```bash
npm ci
npm run dev
```

Then open `http://localhost:3000`.

### If something does not work

- **Visual Studio says the project type was not found:** make sure you opened the correct solution for your Visual Studio version. For VS 2019 use `SP-API-VS2019.sln`; for VS 2022+ use `SP-API.sln`. Also install the **Node.js development** workload from Visual Studio Installer if it is missing.
- **Visual Studio says `node-terminal` was not found:** your ZIP is older than the VS 2019 compatibility fix. Download the latest ZIP and open `SP-API-VS2019.sln` again.
- **Turbopack crashes while reading a file inside `.vs\FileContentIndex`:** your ZIP is older than the VS compatibility fix. Download the latest ZIP. Visual Studio runs use Webpack and Tailwind only scans the `src` folder, so the Visual Studio cache is not read.
- **`npm` is not recognized:** install Node.js 24+ and reopen Visual Studio or the terminal.
- **`next` is not recognized:** run `npm ci` in the project folder, then run again.
- **First run looks stuck:** the launcher first checks the npm registry, then installs packages. If the registry check or install fails, read the error shown in the same window instead of waiting indefinitely.
- **`UNABLE_TO_VERIFY_LEAF_SIGNATURE`:** the Windows launcher already enables the Windows certificate store. If this error still appears, the PC does not trust the company/network root certificate; ask IT for the approved CA or configure npm with that approved CA file. Do not disable SSL verification.
- **A previous `npm ci` failed:** just run the Visual Studio solution again after fixing the reported network/certificate problem. The launcher only marks dependencies as ready after a complete successful install.
- **Dependencies look broken:** close the app, delete the `node_modules` folder, run `npm ci`, and start again.
- **Port 3000 is already in use:** close the other local Next.js/Node app using that port, then start this project again.
- **Hydration warning mentions a browser-extension attribute:** disable that extension for `localhost` or test in a private/incognito window. The app also suppresses harmless root-level extension attribute mismatches.

## Automated verification

GitHub Actions verifies the normal install/lint/test/build flow on Linux and also performs a fresh Windows startup using the same VS 2019 wrapper. The Windows job waits for `/api/health` before passing, which catches first-run/bootstrap regressions before a ZIP is handed to a client.

## Verify a production build

```bash
npm run lint
npm test
npm run build
npm start
```

The regression tests cover exact ISO-8601 timestamp preservation (including static Sandbox fixtures), invalid calendar dates, and quoted CSV item rows for MSKUs that contain commas.

## Deployment scope

This repository is designed as a **local or private operator workbench**. It is appropriate for an internal client tool where an authorized operator supplies the app/seller credentials for the active session.

Do **not** expose this exact credential-entry model as a public multi-seller SaaS application. For a public application, keep the LWA client secret only on the server, authenticate your own users, store each seller refresh token encrypted, and reference a seller connection from the browser instead of asking sellers to enter the app client secret.

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
- Static Sandbox fixture values are **guidance only**. They are displayed above the normal request fields and are never silently inserted or substituted.
- Sandbox and Production use the same visible request fields and IDs. The only environment-specific transport behavior is where Amazon's static sandbox itself differs from Production (for example, mock document URLs and non-persistent feed upload content).
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

Amazon's **static** sandbox examples are independent fixtures, so an ID returned by one static example does not always feed into the next example. The workbench no longer substitutes those fixtures automatically. Sandbox and Production show the same request fields; when Sandbox is selected, a yellow **Sandbox example** panel shows Amazon's documented fixture values and the user enters them explicitly. What is visible in the form is what the request builder sends.

FBA Inventory is different: Amazon currently marks `GET /fba/inventory/v1/summaries` as a **dynamic sandbox** operation. Its results depend on inventory state created in the sandbox, so an empty inventory response is valid and is not replaced with fabricated static data.
## Manual Sandbox testing

When **Sandbox** is selected, each static operation shows an Amazon fixture example above the normal form. Enter the example values yourself if you want a matching mocked response. You can also enter different values to deliberately test Amazon's sandbox validation/error behavior.

Examples include:

- Catalog: US marketplace + ASIN `B07N4M94X4`, or keywords `samsung,tv`, with the fixture's exact `includedData` list.
- Fees: US marketplace + ASIN `B00V5DG6IQ`, price/shipping `10`, Merchant fulfillment, request identifier `UmaS1`, zero points.
- Orders: Japan marketplace + the documented created-after/order-ID examples and exact included-data override.
- Reports/Feeds: the documented report/feed filters, IDs, document IDs, content type, and marketplace lists.
- Fulfillment Inbound: the documented plan, shipment, operation, MSKU, address, label, and document values.

FBA Inventory remains a **dynamic Sandbox** operation, so its data depends on the sandbox inventory state rather than a single canned fixture.

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
| Create inbound plan | Real ship-from address and items as `MSKU, quantity, prepOwner, labelOwner`; quote an MSKU if it contains a comma; only one destination marketplace is supported | `inboundPlanId` + `operationId` |
| Item labels | `MSKU, quantity` rows, label format and page type; quote an MSKU if it contains a comma; quantity max is 10,000 per MSKU | One or more expiring document-download URLs |
| Shipment labels | Real shipment ID plus label/page type; package/pallet values when applicable | Amazon-generated label download URL |
| Bill of lading | Real eligible shipment ID | Amazon-generated bill-of-lading URL when that shipment supports one |

### Recommended first Production tests

Start with read-only operations in this order: connection test → Catalogue item → Fee estimate → FBA inventory → Search orders (PII off) → List reports → List feeds → List inbound plans. These verify credentials, roles, marketplace routing, pagination, and response rendering without creating or changing Amazon resources.

For writes, **Request report** is the safest next test because it creates a report job rather than changing a listing or shipment. Do not use **Submit feed** or **Create inbound plan** as generic connectivity tests; use them only with deliberate seller data and a payload you actually intend Amazon to process.

For Production listing changes, use `JSON_LISTINGS_FEED` (or the Listings Items API for individual SKU changes). Amazon removed the legacy XML/flat listing feed types on July 31, 2025; the workbench rejects those removed listing feed types in Production while still allowing documented legacy fixture values in Static Sandbox.

## API references

- [Connect to SP-API](https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api)
- [Catalog Items API](https://developer-docs.amazon.com/sp-api/reference/catalog-items-v2022-04-01)
- [Product Fees API](https://developer-docs.amazon.com/sp-api/reference/product-fees-v0)
