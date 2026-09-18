import { z } from "zod";

export const credentialsSchema = z.object({
  clientId: z.string().trim().min(1, "Client ID is required"),
  clientSecret: z.string().trim().min(1, "Client secret is required"),
  refreshToken: z.string().trim().min(1, "Refresh token is required"),
});

export const baseRequestSchema = credentialsSchema.extend({
  marketplaceId: z.string().trim().min(1, "Marketplace is required"),
});

export const catalogRequestSchema = baseRequestSchema.extend({
  mode: z.enum(["identifier", "keywords"]),
  query: z.string().trim().min(1, "Enter a product identifier or keywords"),
  identifierType: z.enum(["ASIN", "EAN", "GTIN", "ISBN", "JAN", "MINSAN", "SKU", "UPC"]),
  sellerId: z.string().trim().optional().default(""),
}).superRefine((value, context) => {
  if (value.mode === "identifier" && value.identifierType === "SKU" && !value.sellerId) {
    context.addIssue({ code: "custom", path: ["sellerId"], message: "Seller ID is required for SKU searches" });
  }
});

export const feesRequestSchema = baseRequestSchema.extend({
  idType: z.enum(["ASIN", "SKU"]),
  identifier: z.string().trim().min(1, "ASIN or SKU is required"),
  price: z.coerce.number().positive("Price must be greater than zero"),
  shipping: z.coerce.number().min(0, "Shipping cannot be negative").default(0),
  currency: z.string().trim().length(3, "Use a three-letter currency code"),
  isAmazonFulfilled: z.boolean(),
});

export const operationRequestSchema = baseRequestSchema.extend({
  operation: z.enum([
    "inventory",
    "orders",
    "order",
    "reports",
    "createReport",
    "report",
    "reportDocument",
    "feeds",
    "feed",
    "submitFeed",
    "inboundPlans",
    "inboundPlan",
    "inboundShipment",
    "prepDetails",
    "createInboundPlan",
    "itemLabels",
    "shipmentLabels",
    "billOfLading",
  ]),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type Credentials = z.infer<typeof credentialsSchema>;
