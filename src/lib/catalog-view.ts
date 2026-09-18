export type ProductImage = {
  link: string;
  variant: string;
  width: number | null;
  height: number | null;
};

export type DetailRow = { label: string; value: string };
export type SalesRank = { title: string; rank: number; group: string };
export type ProductRelationship = {
  asin: string;
  direction: "Parent" | "Child";
  type: string;
  variationTheme: string;
};

export type CatalogItemView = {
  asin: string;
  title: string;
  brand: string;
  productType: string;
  images: ProductImage[];
  identifiers: string[];
  datasets: string[];
  overview: DetailRow[];
  attributes: DetailRow[];
  itemDimensions: DetailRow[];
  packageDimensions: DetailRow[];
  classifications: DetailRow[];
  salesRanks: SalesRank[];
  relationships: ProductRelationship[];
  vendorDetails: DetailRow[];
};

const datasetNames = [
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
] as const;

const summaryLabels: Record<string, string> = {
  adultProduct: "Adult product",
  autographed: "Autographed",
  color: "Colour",
  itemClassification: "Item classification",
  manufacturer: "Manufacturer",
  memorabilia: "Memorabilia",
  modelNumber: "Model number",
  packageQuantity: "Package quantity",
  partNumber: "Part number",
  releaseDate: "Release date",
  size: "Size",
  style: "Style",
  tradeInEligible: "Trade-in eligible",
  websiteDisplayGroup: "Display group code",
  websiteDisplayGroupName: "Display group",
};

export function extractCatalogItems(data: unknown): CatalogItemView[] {
  const payload = asRecord(data);
  if (!Array.isArray(payload.items)) return [];

  return payload.items.map(normalizeCatalogItem).filter((item): item is CatalogItemView => item !== null);
}

function normalizeCatalogItem(value: unknown): CatalogItemView | null {
  const raw = asRecord(value);
  const asin = stringValue(raw.asin);
  if (!asin) return null;

  const summary = firstRecord(raw.summaries);
  const productType = firstRecord(raw.productTypes);
  const datasets = datasetNames.filter((key) => raw[key] !== undefined);

  return {
    asin,
    title: stringValue(summary.itemName) || "Untitled catalogue item",
    brand: stringValue(summary.brand),
    productType: stringValue(productType.productType) || "PRODUCT",
    images: collectImages(raw.images),
    identifiers: collectIdentifiers(raw.identifiers),
    datasets,
    overview: collectSummary(summary),
    attributes: collectAttributes(raw.attributes),
    ...collectDimensions(raw.dimensions),
    classifications: collectClassifications(raw.classifications, summary.browseClassification),
    salesRanks: collectSalesRanks(raw.salesRanks),
    relationships: collectRelationships(raw.relationships),
    vendorDetails: collectVendorDetails(raw.vendorDetails),
  };
}

function collectImages(value: unknown): ProductImage[] {
  if (!Array.isArray(value)) return [];
  const output: ProductImage[] = [];
  const seen = new Set<string>();
  for (const groupValue of value) {
    const group = asRecord(groupValue);
    if (!Array.isArray(group.images)) continue;
    for (const imageValue of group.images) {
      const image = asRecord(imageValue);
      const link = stringValue(image.link);
      if (!link || seen.has(link)) continue;
      seen.add(link);
      output.push({
        link,
        variant: stringValue(image.variant) || "IMAGE",
        width: numberValue(image.width),
        height: numberValue(image.height),
      });
    }
  }
  return output.sort((left, right) => imageOrder(left.variant) - imageOrder(right.variant));
}

function imageOrder(variant: string) {
  if (variant === "MAIN") return 0;
  if (variant === "SWCH") return 99;
  const number = Number(variant.replace("PT", ""));
  return Number.isFinite(number) ? number : 50;
}

function collectIdentifiers(value: unknown) {
  if (!Array.isArray(value)) return [];
  const output = new Set<string>();
  for (const groupValue of value) {
    const group = asRecord(groupValue);
    if (!Array.isArray(group.identifiers)) continue;
    for (const identifierValue of group.identifiers) {
      const identifier = asRecord(identifierValue);
      const type = stringValue(identifier.identifierType);
      const id = stringValue(identifier.identifier);
      if (type && id) output.add(`${type} · ${id}`);
    }
  }
  return [...output];
}

function collectSummary(summary: Record<string, unknown>): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const [key, label] of Object.entries(summaryLabels)) {
    const value = displayValue(summary[key]);
    if (value) rows.push({ label, value });
  }
  if (Array.isArray(summary.contributors)) {
    const contributors = summary.contributors.map((entry) => {
      const contributor = asRecord(entry);
      return [stringValue(contributor.role), stringValue(contributor.value)].filter(Boolean).join(": ");
    }).filter(Boolean);
    if (contributors.length) rows.push({ label: "Contributors", value: contributors.join(", ") });
  }
  return rows;
}

function collectAttributes(value: unknown): DetailRow[] {
  const attributes = asRecord(value);
  return Object.entries(attributes).map(([key, rawValue]) => ({
    label: humanize(key),
    value: attributeValue(rawValue),
  })).filter((row) => row.value.length > 0).sort((left, right) => left.label.localeCompare(right.label));
}

function attributeValue(value: unknown): string {
  const entries = Array.isArray(value) ? value : [value];
  const formatted = entries.map((entry) => {
    const record = asRecord(entry);
    const raw = record.display_value ?? record.value ?? entry;
    const result = displayValue(raw);
    const unit = stringValue(record.unit);
    return result && unit && !result.endsWith(` ${unit}`) ? `${result} ${unit}` : result;
  }).filter(Boolean);
  return [...new Set(formatted)].join("; ");
}

function collectDimensions(value: unknown) {
  const group = firstRecord(value);
  return {
    itemDimensions: dimensionRows(group.item),
    packageDimensions: dimensionRows(group.package),
  };
}

function dimensionRows(value: unknown): DetailRow[] {
  const dimensions = asRecord(value);
  return ["length", "width", "height", "weight"].map((key) => {
    const dimension = asRecord(dimensions[key]);
    const amount = displayValue(dimension.value);
    const unit = stringValue(dimension.unit);
    return amount ? { label: humanize(key), value: [amount, unit].filter(Boolean).join(" ") } : null;
  }).filter((row): row is DetailRow => row !== null);
}

function collectClassifications(value: unknown, summaryClassification: unknown): DetailRow[] {
  const output: DetailRow[] = [];
  const seen = new Set<string>();
  const add = (classification: unknown) => {
    let current = asRecord(classification);
    const path: string[] = [];
    const ids: string[] = [];
    let guard = 0;
    while (Object.keys(current).length && guard < 20) {
      const name = stringValue(current.displayName);
      const id = stringValue(current.classificationId);
      if (name) path.unshift(name);
      if (id) ids.unshift(id);
      current = asRecord(current.parent);
      guard += 1;
    }
    const valueText = path.join(" › ");
    const key = `${valueText}|${ids.join("/")}`;
    if (!valueText || seen.has(key)) return;
    seen.add(key);
    output.push({ label: "Browse path", value: ids.length ? `${valueText} (${ids.at(-1)})` : valueText });
  };

  add(summaryClassification);
  if (Array.isArray(value)) {
    for (const groupValue of value) {
      const group = asRecord(groupValue);
      if (Array.isArray(group.classifications)) group.classifications.forEach(add);
    }
  }
  return output;
}

function collectSalesRanks(value: unknown): SalesRank[] {
  if (!Array.isArray(value)) return [];
  const output: SalesRank[] = [];
  for (const groupValue of value) {
    const group = asRecord(groupValue);
    for (const key of ["displayGroupRanks", "classificationRanks"]) {
      if (!Array.isArray(group[key])) continue;
      for (const rankValue of group[key]) {
        const rank = asRecord(rankValue);
        const number = numberValue(rank.rank);
        if (number === null) continue;
        output.push({
          title: stringValue(rank.title) || "Amazon category",
          rank: number,
          group: key === "displayGroupRanks" ? "Display group" : "Classification",
        });
      }
    }
  }
  return output.sort((left, right) => left.rank - right.rank);
}

function collectRelationships(value: unknown): ProductRelationship[] {
  if (!Array.isArray(value)) return [];
  const output: ProductRelationship[] = [];
  const seen = new Set<string>();
  for (const groupValue of value) {
    const group = asRecord(groupValue);
    if (!Array.isArray(group.relationships)) continue;
    for (const relationshipValue of group.relationships) {
      const relationship = asRecord(relationshipValue);
      const type = humanize(stringValue(relationship.type) || "Related");
      const theme = asRecord(relationship.variationTheme);
      const variationTheme = Array.isArray(theme.attributes) ? theme.attributes.filter((item): item is string => typeof item === "string").map(humanize).join(" + ") : "";
      for (const [key, direction] of [["parentAsins", "Parent"], ["childAsins", "Child"]] as const) {
        if (!Array.isArray(relationship[key])) continue;
        for (const asin of relationship[key]) {
          if (typeof asin !== "string") continue;
          const unique = `${direction}|${type}|${asin}`;
          if (seen.has(unique)) continue;
          seen.add(unique);
          output.push({ asin, direction, type, variationTheme });
        }
      }
    }
  }
  return output;
}

function collectVendorDetails(value: unknown): DetailRow[] {
  const vendor = firstRecord(value);
  const rows: DetailRow[] = [];
  const add = (label: string, raw: unknown) => {
    const valueText = displayValue(raw);
    if (valueText) rows.push({ label, value: valueText });
  };
  add("Brand code", vendor.brandCode);
  add("Manufacturer code", vendor.manufacturerCode);
  add("Parent manufacturer code", vendor.manufacturerCodeParent);
  add("Product group", vendor.productGroup);
  add("Replenishment category", humanize(stringValue(vendor.replenishmentCategory)));
  for (const [key, label] of [["productCategory", "Product category"], ["productSubcategory", "Product subcategory"]] as const) {
    const category = asRecord(vendor[key]);
    const name = stringValue(category.displayName);
    const code = stringValue(category.value);
    if (name || code) rows.push({ label, value: name && code ? `${name} (${code})` : name || code });
  }
  return rows;
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  const record = asRecord(value);
  if (!Object.keys(record).length) return "";
  if (record.value !== undefined) {
    const amount = displayValue(record.value);
    const unit = stringValue(record.unit);
    return [amount, unit].filter(Boolean).join(" ");
  }
  return Object.entries(record).map(([key, nested]) => {
    const formatted = displayValue(nested);
    return formatted ? `${humanize(key)}: ${formatted}` : "";
  }).filter(Boolean).join("; ");
}

function firstRecord(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) return {};
  return asRecord(value.find((entry) => Object.keys(asRecord(entry)).length > 0));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
