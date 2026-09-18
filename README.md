# SP-API Workbench

A local workbench for testing Amazon Selling Partner API credentials and running the product, inventory, order, report, feed, and FBA inbound workflows found in the original `FbaFees` desktop project.

## Included tools

- LWA credential test (`client_id`, `client_secret`, and `refresh_token`)
- Catalog Items API `2022-04-01`
- ASIN, UPC, EAN, GTIN, ISBN, JAN, MINSAN, SKU, and keyword searches
- Exact-ASIN lookup with every Catalog Items dataset and recursive variation/package-family retrieval
- Structured catalogue results with all returned images plus complete raw JSON
- Product Fees API v0 estimates for ASINs and seller SKUs
- FBA inventory summaries
- Order search and full order retrieval using Orders API `2026-01-01`, requesting every optional data group
- Report listing, creation, status, and document URL retrieval
- Feed listing, status, document upload, and submission
- FBA inbound plan, shipment, prep, plan creation, and item-label tools using Fulfillment Inbound `2024-03-20`
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

## API references

- [Connect to SP-API](https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api)
- [Catalog Items API](https://developer-docs.amazon.com/sp-api/reference/catalog-items-v2022-04-01)
- [Product Fees API](https://developer-docs.amazon.com/sp-api/reference/product-fees-v0)
