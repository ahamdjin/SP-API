# SP-API Workbench

A local workbench for testing Amazon Selling Partner API credentials and running the product, inventory, order, report, feed, and FBA inbound workflows found in the original `FbaFees` desktop project.

## Included tools

- LWA credential test (`client_id`, `client_secret`, and `refresh_token`)
- Catalog Items API `2022-04-01`
- ASIN, UPC, EAN, GTIN, ISBN, JAN, MINSAN, SKU, and keyword searches
- Structured catalogue results plus complete raw JSON
- Product Fees API v0 estimates for ASINs and seller SKUs
- FBA inventory summaries
- Order search and full order retrieval using Orders API `2026-01-01`
- Report listing, creation, status, and document URL retrieval
- Feed listing, status, document upload, and submission
- FBA inbound plan, shipment, prep, plan creation, and item-label tools using Fulfillment Inbound `2024-03-20`
- Marketplace-aware endpoints, currencies, and locales
- Amazon request ID, rate-limit, duration, and HTTP status inspection

Amazon write operations are clearly marked and require an explicit confirmation before each run.

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
