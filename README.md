# SP-API Workbench

A private, read-only workbench for testing Amazon Selling Partner API credentials, searching the Amazon catalogue, inspecting full responses, and estimating product fees.

## Included tools

- LWA credential test (`client_id`, `client_secret`, and `refresh_token`)
- Catalog Items API `2022-04-01`
- ASIN, UPC, EAN, GTIN, ISBN, JAN, MINSAN, SKU, and keyword searches
- Structured catalogue results plus complete raw JSON
- Product Fees API v0 estimates for ASINs and seller SKUs
- Marketplace-aware endpoints, currencies, and locales
- Amazon request ID, rate-limit, duration, and HTTP status inspection

The application intentionally contains no feed, listing, inventory, order, or shipment mutations.

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
