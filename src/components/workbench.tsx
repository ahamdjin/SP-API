"use client";

import Image from "next/image";
import {
  Archive,
  Braces,
  Check,
  Clipboard,
  ClipboardList,
  Database,
  Eye,
  EyeOff,
  FileBarChart,
  FileSearch,
  KeyRound,
  ListChecks,
  LoaderCircle,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Tags,
  TerminalSquare,
  Truck,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { getMarketplace, marketplaces } from "@/lib/marketplaces";

type Credentials = { clientId: string; clientSecret: string; refreshToken: string };
type ApiResult = {
  ok?: boolean; status?: number; statusText?: string; requestId?: string | null;
  rateLimit?: string | null; durationMs?: number; data?: unknown; error?: string;
  details?: unknown; message?: string; expiresIn?: number;
};
type Operation =
  | "catalog" | "fees" | "inventory" | "orders" | "order"
  | "reports" | "createReport" | "report" | "reportDocument"
  | "feeds" | "feed" | "submitFeed"
  | "inboundPlans" | "inboundPlan" | "inboundShipment"
  | "prepDetails" | "createInboundPlan" | "itemLabels"
  | "shipmentLabels" | "billOfLading"
  | "legacyConvert" | "legacyFc";
type FieldValue = string | boolean;
type OperationItem = {
  id: Operation;
  label: string;
  description: string;
  icon: LucideIcon;
  kind: "read" | "write" | "legacy";
};

const initialCredentials: Credentials = { clientId: "", clientSecret: "", refreshToken: "" };
const defaultFields: Record<string, FieldValue> = {
  details: true,
  pageSize: "20",
  createdAfter: toLocalDateTime(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)),
  createdBefore: "",
  statuses: "UNSHIPPED,SHIPPED",
  fulfilledBy: "AMAZON",
  reportTypes: "GET_FLAT_FILE_OPEN_LISTINGS_DATA",
  reportType: "GET_FLAT_FILE_OPEN_LISTINGS_DATA",
  processingStatuses: "DONE,IN_PROGRESS,IN_QUEUE",
  feedTypes: "JSON_LISTINGS_FEED",
  feedType: "JSON_LISTINGS_FEED",
  contentType: "application/json; charset=UTF-8",
  status: "ACTIVE",
  sortBy: "LAST_UPDATED_TIME",
  sortOrder: "DESC",
  countryCode: "US",
  labelType: "STANDARD_FORMAT",
  pageType: "A4_21",
  shipmentPageType: "PackageLabel_Thermal_NonPCP",
  shipmentLabelType: "UNIQUE",
  items: "MY-SKU-001, 1, SELLER, SELLER",
  confirmed: false,
};

const operationGroups: Array<{ label: string; items: OperationItem[] }> = [
  {
    label: "Products",
    items: [
      { id: "catalog", label: "Catalogue item", description: "All datasets, images and related ASINs", icon: PackageSearch, kind: "read" },
      { id: "fees", label: "Fee estimate", description: "ASIN or seller SKU", icon: ReceiptText, kind: "read" },
      { id: "inventory", label: "FBA inventory", description: "Inventory summaries and quantities", icon: Warehouse, kind: "read" },
    ],
  },
  {
    label: "Orders",
    items: [
      { id: "orders", label: "Search orders", description: "Date, status and fulfilment filters", icon: ShoppingCart, kind: "read" },
      { id: "order", label: "Get order", description: "Order with items and fulfilment", icon: ClipboardList, kind: "read" },
    ],
  },
  {
    label: "Reports",
    items: [
      { id: "reports", label: "List reports", description: "Find recent report jobs", icon: FileBarChart, kind: "read" },
      { id: "createReport", label: "Request report", description: "Start a new Amazon report", icon: PackagePlus, kind: "write" },
      { id: "report", label: "Report status", description: "Check report processing", icon: FileSearch, kind: "read" },
      { id: "reportDocument", label: "Report document", description: "Get the download URL", icon: Archive, kind: "read" },
    ],
  },
  {
    label: "Feeds",
    items: [
      { id: "feeds", label: "List feeds", description: "Review feed jobs", icon: ListChecks, kind: "read" },
      { id: "feed", label: "Feed status", description: "Inspect a feed by ID", icon: FileSearch, kind: "read" },
      { id: "submitFeed", label: "Submit feed", description: "Upload and start a feed", icon: Send, kind: "write" },
    ],
  },
  {
    label: "FBA inbound",
    items: [
      { id: "inboundPlans", label: "List plans", description: "Active, shipped or voided plans", icon: Truck, kind: "read" },
      { id: "inboundPlan", label: "Get plan", description: "Inspect an inbound plan", icon: PackageCheck, kind: "read" },
      { id: "inboundShipment", label: "Get shipment", description: "Plan and shipment details", icon: Truck, kind: "read" },
      { id: "prepDetails", label: "Prep details", description: "Prep instructions by MSKU", icon: ListChecks, kind: "read" },
      { id: "createInboundPlan", label: "Create plan", description: "Address and SKU quantities", icon: PackagePlus, kind: "write" },
      { id: "itemLabels", label: "Item labels", description: "Create printable MSKU labels", icon: Tags, kind: "read" },
      { id: "shipmentLabels", label: "Shipment labels", description: "Package, 2D or pallet labels", icon: Tags, kind: "read" },
      { id: "billOfLading", label: "Bill of lading", description: "Get the shipment document", icon: FileSearch, kind: "read" },
    ],
  },
  {
    label: "Legacy database",
    items: [
      { id: "legacyConvert", label: "Convert Amazon_US", description: "Requires the old SQL database", icon: Database, kind: "legacy" },
      { id: "legacyFc", label: "SKU / FC bulk update", description: "Requires SkuType and FC tables", icon: Database, kind: "legacy" },
    ],
  },
];

export function Workbench() {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [showSecrets, setShowSecrets] = useState(false);
  const [marketplaceId, setMarketplaceId] = useState("ATVPDKIKX0DER");
  const [operation, setOperation] = useState<Operation>("catalog");
  const [connectionState, setConnectionState] = useState<"idle" | "testing" | "ready" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState("Not tested");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [fields, setFields] = useState<Record<string, FieldValue>>(defaultFields);
  const [catalog, setCatalog] = useState({
    mode: "identifier" as "identifier" | "keywords",
    identifierType: "ASIN",
    query: "",
    sellerId: "",
    includeVariations: true,
    brandNames: "",
    classificationIds: "",
    pageSize: "20",
    pageToken: "",
  });
  const [fees, setFees] = useState({ idType: "ASIN" as "ASIN" | "SKU", identifier: "", price: "", shipping: "0", isAmazonFulfilled: true });

  const marketplace = useMemo(() => getMarketplace(marketplaceId) ?? marketplaces[0], [marketplaceId]);
  const catalogItems = useMemo(() => extractCatalogItems(result), [result]);
  const catalogFamily = useMemo(() => extractCatalogFamily(result), [result]);
  const feeSummary = useMemo(() => extractFeeSummary(result), [result]);
  const credentialsComplete = Object.values(credentials).every((value) => value.trim().length > 0);
  const activeItem = operationGroups.flatMap((group) => group.items).find((item) => item.id === operation)!;
  const ActiveIcon = activeItem.icon;

  function updateCredential(key: keyof Credentials, value: string) {
    setCredentials((current) => ({ ...current, [key]: value }));
    if (connectionState !== "idle") {
      setConnectionState("idle");
      setConnectionMessage("Credentials changed");
    }
  }

  function updateField(key: string, value: FieldValue) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function testConnection() {
    setConnectionState("testing");
    setConnectionMessage("Requesting token…");
    try {
      const response = await postJson("/api/sp-api/test", credentials);
      if (!response.ok) throw new Error(response.error ?? "Connection failed");
      setConnectionState("ready");
      setConnectionMessage("Connected · token valid " + Math.round((response.expiresIn ?? 3600) / 60) + " min");
    } catch (error) {
      setConnectionState("error");
      setConnectionMessage(error instanceof Error ? error.message : "Connection failed");
    }
  }

  async function runRequest(event: FormEvent) {
    event.preventDefault();
    if (activeItem.kind === "legacy") return;

    let url = "/api/sp-api/operations";
    let payload: unknown = { ...credentials, marketplaceId, operation, fields };
    if (operation === "catalog") {
      url = "/api/sp-api/catalog";
      payload = { ...credentials, marketplaceId, ...catalog };
    }
    if (operation === "fees") {
      url = "/api/sp-api/fees";
      payload = {
        ...credentials,
        marketplaceId,
        ...fees,
        currency: marketplace.currency,
        price: Number(fees.price),
        shipping: Number(fees.shipping),
      };
    }

    setIsLoading(true);
    setResult(null);
    try {
      setResult(await postJson(url, payload));
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Request failed" });
    } finally {
      setIsLoading(false);
    }
  }

  async function copyResponse() {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><TerminalSquare size={18} strokeWidth={2.2} /></div>
          <div><p className="eyebrow">Amazon developer utility</p><h1>SP-API Workbench</h1></div>
        </div>
        <div className="header-status">
          <span className="read-only-badge"><ShieldCheck size={14} /> Local credential session</span>
          <span className={"connection-dot " + connectionState} />
          <span>{connectionMessage}</span>
        </div>
      </header>

      <div className="workbench-grid">
        <form className="credentials-panel" onSubmit={(event) => { event.preventDefault(); void testConnection(); }}>
          <div className="panel-heading">
            <div><span className="section-index">01</span><h2>Connection</h2></div>
            <button className="icon-button" type="button" onClick={() => setShowSecrets((current) => !current)} aria-label={showSecrets ? "Hide credentials" : "Show credentials"}>
              {showSecrets ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <p className="panel-copy">Credentials remain in this browser tab and are never returned in responses.</p>
          <RequirementLegend />
          <div className="field-stack">
            <Field label="LWA client ID" required><input autoComplete="off" required placeholder="amzn1.application-oa2-client…" type={showSecrets ? "text" : "password"} value={credentials.clientId} onChange={(event) => updateCredential("clientId", event.target.value)} /></Field>
            <Field label="LWA client secret" required><input autoComplete="off" required placeholder="Enter client secret" type={showSecrets ? "text" : "password"} value={credentials.clientSecret} onChange={(event) => updateCredential("clientSecret", event.target.value)} /></Field>
            <Field label="Refresh token" required><textarea autoComplete="off" required placeholder="Atzr|…" rows={4} value={credentials.refreshToken} onChange={(event) => updateCredential("refreshToken", event.target.value)} style={showSecrets ? undefined : { WebkitTextSecurity: "disc" } as React.CSSProperties} /></Field>
            <Field label="Marketplace" required>
              <select required value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>
                {marketplaces.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currency} · {item.id}</option>)}
              </select>
            </Field>
          </div>
          <button className="secondary-button full-width" type="submit" disabled={!credentialsComplete || connectionState === "testing"}>
            {connectionState === "testing" ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />} Test credentials
          </button>
          <div className="security-note"><ShieldCheck size={16} /><p>The current standard SP-API flow needs LWA credentials, not the AWS keys stored in the old desktop app.</p></div>
        </form>

        <section className="query-panel">
          <div className="workspace-heading">
            <div><span className="section-index">02</span><h2>Request builder</h2></div>
            <span className="region-label">{marketplace.name} / {marketplace.region.toUpperCase()}</span>
          </div>

          <OperationPicker active={operation} onChange={(next) => { setOperation(next); setResult(null); setFields((current) => ({ ...current, confirmed: false })); }} />

          <form className="request-form" onSubmit={runRequest}>
            <div className="request-intro">
              <div>
                <div className="operation-title-row">
                  <ActiveIcon size={19} />
                  <p className="route-label">{activeItem.kind === "write" ? "Amazon write operation" : activeItem.kind === "legacy" ? "Company-specific legacy utility" : "Amazon read operation"}</p>
                </div>
                <h3>{activeItem.label}</h3>
                <p>{activeItem.description}</p>
              </div>
              <span className={"operation-badge " + activeItem.kind}>{activeItem.kind}</span>
            </div>

            {activeItem.kind !== "legacy" && <RequirementLegend />}

            <OperationFields
              operation={operation}
              fields={fields}
              updateField={updateField}
              catalog={catalog}
              setCatalog={setCatalog}
              fees={fees}
              setFees={setFees}
              currency={marketplace.currency}
            />

            {activeItem.kind === "legacy" ? (
              <div className="legacy-warning"><Database size={18} /><div><strong>Not an SP-API request</strong><p>The old button depends on private SQL tables and business rules that were not included as portable data. It needs a separate database connection and schema mapping.</p></div></div>
            ) : (
              <button className="primary-button" disabled={!credentialsComplete || isLoading || (activeItem.kind === "write" && !Boolean(fields.confirmed))}>
                {isLoading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} Run {activeItem.label.toLowerCase()}
              </button>
            )}
          </form>

          <div className="result-area">
            <div className="result-heading">
              <div><span className="section-index">03</span><h2>Result</h2></div>
              {result && <div className="request-meta">{typeof result.status === "number" && <span className={result.ok ? "status-success" : "status-error"}>{result.status} {result.statusText}</span>}{typeof result.durationMs === "number" && <span>{result.durationMs} ms</span>}{result.rateLimit && <span>{result.rateLimit} req/s</span>}</div>}
            </div>
            {!result && !isLoading && <div className="empty-state"><Braces size={24} /><p>Run the selected operation to inspect Amazon&apos;s response.</p></div>}
            {isLoading && <div className="empty-state loading-state"><LoaderCircle className="spin" size={24} /><p>Waiting for Amazon…</p></div>}
            {result && !result.ok && <div className="error-banner"><X size={18} /><div><strong>Request failed</strong><p>{result.error ?? extractAmazonError(result.data)}</p></div></div>}
            {result?.ok && operation === "catalog" && <div className="catalog-results">
              {catalogFamily && <div className={"family-summary " + (catalogFamily.complete ? "complete" : "partial")}><strong>{catalogFamily.returnedCount} of {catalogFamily.requestedCount} related records returned</strong><span>{catalogFamily.complete ? "Complete variation and package relationship graph" : "Partial related set — see warnings in the JSON response"}</span></div>}
              {catalogItems.length === 0 ? <p className="no-results">Amazon returned no catalogue items.</p> : catalogItems.map((item) => <CatalogResult key={item.asin} item={item} />)}
            </div>}
            {result?.ok && operation === "fees" && feeSummary && <FeeResult summary={feeSummary} />}
            {result?.ok && operation !== "catalog" && operation !== "fees" && <div className="success-summary"><Check size={18} /><div><strong>Amazon accepted the request</strong><p>The complete response is available below.</p></div></div>}
          </div>
        </section>

        <aside className="inspector-panel">
          <div className="panel-heading inspector-heading">
            <div><span className="section-index">04</span><h2>Response inspector</h2></div>
            <button className="icon-button" type="button" disabled={!result} onClick={copyResponse} aria-label="Copy JSON response">{copied ? <Check size={17} /> : <Clipboard size={17} />}</button>
          </div>
          <div className="inspector-meta"><span>JSON</span><span>{result?.requestId ? "Request " + result.requestId : "No request"}</span></div>
          <pre className="json-viewer"><code>{result ? JSON.stringify(result, null, 2) : "// Amazon's response will appear here.\n// Credentials are never included."}</code></pre>
        </aside>
      </div>
    </main>
  );
}

function OperationPicker({ active, onChange }: { active: Operation; onChange: (operation: Operation) => void }) {
  return <div className="operation-picker">{operationGroups.map((group) => (
    <div className="operation-group" key={group.label}>
      <p>{group.label}</p>
      <div className="operation-list">{group.items.map((item) => {
        const Icon = item.icon;
        return <button aria-pressed={active === item.id} className={(active === item.id ? "active " : "") + item.kind} key={item.id} onClick={() => onChange(item.id)} type="button">
          <Icon size={15} /><span><strong>{item.label}</strong><small>{item.description}</small></span>
        </button>;
      })}</div>
    </div>
  ))}</div>;
}

type CatalogState = {
  mode: "identifier" | "keywords";
  identifierType: string;
  query: string;
  sellerId: string;
  includeVariations: boolean;
  brandNames: string;
  classificationIds: string;
  pageSize: string;
  pageToken: string;
};
type FeesState = { idType: "ASIN" | "SKU"; identifier: string; price: string; shipping: string; isAmazonFulfilled: boolean };

function OperationFields({
  operation, fields, updateField, catalog, setCatalog, fees, setFees, currency,
}: {
  operation: Operation;
  fields: Record<string, FieldValue>;
  updateField: (key: string, value: FieldValue) => void;
  catalog: CatalogState;
  setCatalog: React.Dispatch<React.SetStateAction<CatalogState>>;
  fees: FeesState;
  setFees: React.Dispatch<React.SetStateAction<FeesState>>;
  currency: string;
}) {
  if (operation === "catalog") return <div className="operation-fields">
    <Choice label="Search mode" required options={["identifier", "keywords"]} value={catalog.mode} onChange={(value) => setCatalog((current) => ({ ...current, mode: value as "identifier" | "keywords" }))} />
    {catalog.mode === "identifier" && <Choice label="Identifier type" required options={["ASIN", "UPC", "EAN", "GTIN", "ISBN", "SKU", "JAN", "MINSAN"]} value={catalog.identifierType} onChange={(value) => setCatalog((current) => ({ ...current, identifierType: value }))} />}
    <Field label={catalog.mode === "keywords" ? "Search terms" : "Product identifier(s)"} required><input required placeholder={catalog.mode === "keywords" ? "wireless barcode scanner" : "One value, or up to 20 separated by commas"} value={catalog.query} onChange={(event) => setCatalog((current) => ({ ...current, query: event.target.value }))} /></Field>
    {catalog.identifierType === "SKU" && catalog.mode === "identifier" && <Field label="Seller ID" required requirement="Required for SKU"><input required placeholder="A1XXXXXXXXXXXX" value={catalog.sellerId} onChange={(event) => setCatalog((current) => ({ ...current, sellerId: event.target.value }))} /></Field>}
    {catalog.mode === "identifier" && catalog.identifierType === "ASIN" && <CheckField label="Fetch every related variation and package ASIN for one ASIN" checked={catalog.includeVariations} onChange={(includeVariations) => setCatalog((current) => ({ ...current, includeVariations }))} />}
    {catalog.mode === "keywords" && <>
      <Field label="Brand names"><input placeholder="Nike,Adidas" value={catalog.brandNames} onChange={(event) => setCatalog((current) => ({ ...current, brandNames: event.target.value }))} /></Field>
      <Field label="Classification IDs"><input placeholder="Comma-separated" value={catalog.classificationIds} onChange={(event) => setCatalog((current) => ({ ...current, classificationIds: event.target.value }))} /></Field>
      <Field label="Results per page"><input min="1" max="20" type="number" value={catalog.pageSize} onChange={(event) => setCatalog((current) => ({ ...current, pageSize: event.target.value }))} /></Field>
      <Field label="Next-page token"><input placeholder="From the previous response" value={catalog.pageToken} onChange={(event) => setCatalog((current) => ({ ...current, pageToken: event.target.value }))} /></Field>
    </>}
    <div className="dataset-note"><Check size={15} /><span>Requests attributes, classifications, dimensions, identifiers, images, product types, relationships, sales ranks, summaries, and vendor details.</span></div>
  </div>;

  if (operation === "fees") return <div className="operation-fields">
    <Choice label="Lookup by" required options={["ASIN", "SKU"]} value={fees.idType} onChange={(value) => setFees((current) => ({ ...current, idType: value as "ASIN" | "SKU" }))} />
    <Field label={fees.idType} required><input required placeholder={fees.idType === "ASIN" ? "B0XXXXXXXX" : "SELLER-SKU"} value={fees.identifier} onChange={(event) => setFees((current) => ({ ...current, identifier: event.target.value }))} /></Field>
    <Field label={"Listing price · " + currency} required><input required min="0.01" step="0.01" type="number" placeholder="29.99" value={fees.price} onChange={(event) => setFees((current) => ({ ...current, price: event.target.value }))} /></Field>
    <Field label={"Shipping · " + currency}><input min="0" step="0.01" type="number" value={fees.shipping} onChange={(event) => setFees((current) => ({ ...current, shipping: event.target.value }))} /></Field>
    <Choice label="Fulfilment" required options={["FBA", "Merchant"]} value={fees.isAmazonFulfilled ? "FBA" : "Merchant"} onChange={(value) => setFees((current) => ({ ...current, isAmazonFulfilled: value === "FBA" }))} />
  </div>;

  const value = (key: string) => String(fields[key] ?? "");
  const text = (key: string, label: string, placeholder = "", required = false, requirement?: string) => <Field label={label} required={required} requirement={requirement}><input required={required} placeholder={placeholder} value={value(key)} onChange={(event) => updateField(key, event.target.value)} /></Field>;
  const date = (key: string, label: string, required = false) => <Field label={label} required={required}><input required={required} type="datetime-local" value={value(key)} onChange={(event) => updateField(key, event.target.value)} /></Field>;
  const textarea = (key: string, label: string, placeholder = "", required = false) => <Field label={label} required={required}><textarea required={required} placeholder={placeholder} rows={5} value={value(key)} onChange={(event) => updateField(key, event.target.value)} /></Field>;

  let content: React.ReactNode;
  switch (operation) {
    case "inventory":
      content = <>{textarea("sellerSkus", "Seller SKUs", "Optional · one SKU per line or comma-separated")}{date("startDateTime", "Changed since")}{text("inventoryNextToken", "Next-page token", "Optional · from the previous response")}<CheckField label="Include quantity details" checked={Boolean(fields.details)} onChange={(checked) => updateField("details", checked)} /></>;
      break;
    case "orders":
      content = <>{date("createdAfter", "Created after", true)}{date("createdBefore", "Created before")}{text("statuses", "Order statuses", "UNSHIPPED,SHIPPED")}{text("fulfilledBy", "Fulfilled by", "AMAZON or MERCHANT")}{text("pageSize", "Results per page", "50")}{text("orderPaginationToken", "Next-page token", "Optional · from the previous response")}<div className="dataset-note"><Check size={15} /><span>Requests all Orders 2026 data groups, including buyer, recipient, payment, tax, packages, fulfilment, promotions, proceeds, expenses, cancellations, and order items.</span></div></>;
      break;
    case "order":
      content = text("orderId", "Amazon order ID", "114-1234567-1234567", true);
      break;
    case "reports":
      content = <>{text("reportTypes", "Report type(s)", "GET_FLAT_FILE_OPEN_LISTINGS_DATA", true)}{text("processingStatuses", "Processing statuses", "DONE,IN_PROGRESS")}{date("createdSince", "Created since")}{date("createdUntil", "Created until")}{text("pageSize", "Results per page", "20")}{text("reportNextToken", "Next-page token", "Optional · from the previous response")}</>;
      break;
    case "createReport":
      content = <>{text("reportType", "Report type", "GET_FLAT_FILE_OPEN_LISTINGS_DATA", true)}{date("dataStartTime", "Data start")}{date("dataEndTime", "Data end")}<Confirmation fields={fields} updateField={updateField} label="I understand this starts a report job in Amazon." /></>;
      break;
    case "report":
      content = text("reportId", "Report ID", "51665019712", true);
      break;
    case "reportDocument":
      content = text("reportDocumentId", "Report document ID", "amzn1.spdoc...", true);
      break;
    case "feeds":
      content = <>{text("feedTypes", "Feed type(s)", "JSON_LISTINGS_FEED", true)}{text("processingStatuses", "Processing statuses", "DONE,IN_PROGRESS")}{date("createdSince", "Created since")}{date("createdUntil", "Created until")}{text("pageSize", "Results per page", "20")}{text("feedNextToken", "Next-page token", "Optional · from the previous response")}</>;
      break;
    case "feed":
      content = text("feedId", "Feed ID", "123456789", true);
      break;
    case "submitFeed":
      content = <>{text("feedType", "Feed type", "JSON_LISTINGS_FEED", true)}{text("contentType", "Content type", "Defaults to application/json; charset=UTF-8")}{textarea("content", "Feed content", "Paste the complete JSON or tab-delimited feed payload", true)}<Confirmation fields={fields} updateField={updateField} label="I understand this uploads data and starts a feed in Amazon." /></>;
      break;
    case "inboundPlans":
      content = <><Choice label="Plan status" options={["ACTIVE", "SHIPPED", "VOIDED"]} value={value("status")} onChange={(next) => updateField("status", next)} /><Choice label="Sort by" options={["LAST_UPDATED_TIME", "CREATION_TIME"]} value={value("sortBy")} onChange={(next) => updateField("sortBy", next)} /><Choice label="Sort order" options={["DESC", "ASC"]} value={value("sortOrder")} onChange={(next) => updateField("sortOrder", next)} />{text("pageSize", "Results per page", "10")}{text("inboundPaginationToken", "Next-page token", "Optional · from the previous response")}</>;
      break;
    case "inboundPlan":
      content = text("inboundPlanId", "Inbound plan ID", "wf12345678-...", true);
      break;
    case "inboundShipment":
      content = <>{text("inboundPlanId", "Inbound plan ID", "wf12345678-...", true)}{text("shipmentId", "Shipment ID", "sh12345678-...", true)}</>;
      break;
    case "prepDetails":
      content = textarea("mskus", "Merchant SKUs", "One MSKU per line", true);
      break;
    case "createInboundPlan":
      content = <>{text("planName", "Plan name", "September replenishment")}{textarea("items", "Items", "MSKU, quantity, prep owner, label owner", true)}<div className="subsection-label">Ship-from address</div>{text("contactName", "Contact name", "Jane Smith", true)}{text("companyName", "Company")}{text("addressLine1", "Address line 1", "123 Main Street", true)}{text("addressLine2", "Address line 2")}{text("city", "City", "Toronto", true)}{text("stateOrProvinceCode", "State / province", "ON")}{text("postalCode", "Postal code", "M1M 1M1", true)}{text("countryCode", "Country code", "Defaults to marketplace country")}{text("phoneNumber", "Phone number", "+1 555 0100", true)}<Confirmation fields={fields} updateField={updateField} label="I understand this creates an inbound plan in Amazon." /></>;
      break;
    case "itemLabels":
      content = <>{textarea("items", "Items", "MSKU, quantity", true)}<Choice label="Label format" required options={["STANDARD_FORMAT", "THERMAL_PRINTING"]} value={value("labelType")} onChange={(next) => updateField("labelType", next)} /><Choice label="Page type" options={["A4_21", "A4_24", "A4_24_64x33", "A4_24_66x35", "A4_24_70x36", "A4_24_70x37", "A4_24i", "A4_27", "A4_40_52x29", "A4_44_48x25", "Letter_30"]} value={value("pageType")} onChange={(next) => updateField("pageType", next)} /></>;
      break;
    case "shipmentLabels": {
      const palletLabels = value("shipmentLabelType") === "PALLET";
      content = <>{text("shipmentId", "Shipment ID", "FBA123456789", true)}<Choice label="Label type" required options={["UNIQUE", "BARCODE_2D", "PALLET"]} value={value("shipmentLabelType")} onChange={(next) => updateField("shipmentLabelType", next)} />{text("shipmentPageType", "Page type", "Defaults to PackageLabel_Thermal_NonPCP")}{text("numberOfPackages", "Number of packages")}{text("numberOfPallets", "Number of pallets", "", palletLabels, palletLabels ? "Required for PALLET labels" : undefined)}</>;
      break;
    }
    case "billOfLading":
      content = text("shipmentId", "Shipment ID", "FBA123456789", true);
      break;
    default:
      content = null;
  }
  return <div className="operation-fields">{content}</div>;
}

function RequirementLegend() {
  return <div className="requirement-legend"><span><strong>*</strong> Required</span><span>Everything else is marked optional</span></div>;
}

function FieldLabel({ label, required = false, requirement }: { label: string; required?: boolean; requirement?: string }) {
  return <span className="field-label"><span>{label}{required && <strong aria-hidden="true">*</strong>}</span><small className={required ? "required" : "optional"}>{requirement ?? (required ? "Required" : "Optional")}</small></span>;
}

function Field({ label, required = false, requirement, children }: { label: string; required?: boolean; requirement?: string; children: React.ReactNode }) {
  return <label className="field"><FieldLabel label={label} required={required} requirement={requirement} />{children}</label>;
}

function Choice({ label, required = false, options, value, onChange }: { label: string; required?: boolean; options: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="field"><FieldLabel label={label} required={required} /><div aria-required={required} className="choice-grid identifier-choices" role="radiogroup" aria-label={label}>{options.map((option) => <button aria-checked={option === value} className={option === value ? "selected" : ""} key={option} onClick={() => onChange(option)} role="radio" type="button">{formatLabel(option)}</button>)}</div></div>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="check-field"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{label}</span></label>;
}

function Confirmation({ fields, updateField, label }: { fields: Record<string, FieldValue>; updateField: (key: string, value: FieldValue) => void; label: string }) {
  return <div className="write-confirmation"><p><strong>*</strong> Required confirmation</p><CheckField checked={Boolean(fields.confirmed)} label={label} onChange={(checked) => updateField("confirmed", checked)} /></div>;
}

type CatalogItem = { asin: string; title: string; brand: string; productType: string; images: string[]; identifiers: string[]; datasets: string[] };
function CatalogResult({ item }: { item: CatalogItem }) {
  return <article className="catalog-item"><div className="product-gallery">{item.images.length ? item.images.slice(0, 6).map((image, index) => <div className="product-image" key={image}><Image src={image} alt={index === 0 ? item.title : ""} width={86} height={86} unoptimized /></div>) : <div className="product-image"><PackageSearch size={28} /></div>}</div><div className="product-copy"><div className="product-kicker"><span>{item.productType}</span><span>{item.asin}</span></div><h4>{item.title}</h4><p>{item.brand || "Brand not returned"}</p>{item.identifiers.length > 0 && <div className="identifier-list">{item.identifiers.slice(0, 8).map((identifier) => <span key={identifier}>{identifier}</span>)}</div>}<div className="dataset-list">{item.datasets.map((dataset) => <span key={dataset}>{formatLabel(dataset)}</span>)}</div></div></article>;
}

type FeeSummary = { status: string; amount: number | null; currency: string; details: Array<{ type: string; amount: number | null; currency: string }> };
function FeeResult({ summary }: { summary: FeeSummary }) {
  return <div className="fee-result"><div className="fee-total"><span>Total estimated fees</span><strong>{summary.amount === null ? "—" : formatMoney(summary.amount, summary.currency)}</strong><small>{summary.status}</small></div><div className="fee-breakdown">{summary.details.length === 0 ? <p>No itemized fee components were returned.</p> : summary.details.map((detail, index) => <div className="fee-line" key={detail.type + "-" + index}><span>{detail.type}</span><strong>{detail.amount === null ? "—" : formatMoney(detail.amount, detail.currency)}</strong></div>)}</div></div>;
}

async function postJson(url: string, payload: unknown): Promise<ApiResult> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json() as ApiResult;
  if (!response.ok && !data.error) data.error = "Request failed with status " + response.status;
  return data;
}

function extractCatalogItems(result: ApiResult | null): CatalogItem[] {
  if (!result?.ok || !isRecord(result.data) || !Array.isArray(result.data.items)) return [];
  return result.data.items.map((raw): CatalogItem | null => {
    if (!isRecord(raw) || typeof raw.asin !== "string") return null;
    const summaries = Array.isArray(raw.summaries) ? raw.summaries : [];
    const summary = summaries.find(isRecord) ?? {};
    const images = Array.isArray(raw.images) ? raw.images : [];
    const imageGroup = images.find(isRecord);
    const imageList = imageGroup && Array.isArray(imageGroup.images) ? imageGroup.images : [];
    const imageEntries = imageList.filter(isRecord);
    const mainImage = imageEntries.find((entry) => entry.variant === "MAIN");
    const orderedImages = mainImage ? [mainImage, ...imageEntries.filter((entry) => entry !== mainImage)] : imageEntries;
    const imageLinks = [...new Set(orderedImages.map((entry) => stringValue(entry.link)).filter(Boolean))];
    const productTypes = Array.isArray(raw.productTypes) ? raw.productTypes : [];
    const productType = productTypes.find(isRecord);
    const datasets = ["attributes", "classifications", "dimensions", "identifiers", "images", "productTypes", "relationships", "salesRanks", "summaries", "vendorDetails"].filter((key) => raw[key] !== undefined);
    return { asin: raw.asin, title: stringValue(summary.itemName) || "Untitled catalogue item", brand: stringValue(summary.brand), productType: productType ? stringValue(productType.productType) || "PRODUCT" : "PRODUCT", images: imageLinks, identifiers: collectIdentifiers(raw.identifiers), datasets };
  }).filter((item): item is CatalogItem => item !== null);
}

type CatalogFamily = { requestedCount: number; returnedCount: number; complete: boolean };
function extractCatalogFamily(result: ApiResult | null): CatalogFamily | null {
  if (!result?.ok || !isRecord(result.data) || !isRecord(result.data.family)) return null;
  const family = result.data.family;
  if (typeof family.requestedCount !== "number" || typeof family.returnedCount !== "number" || typeof family.complete !== "boolean") return null;
  return { requestedCount: family.requestedCount, returnedCount: family.returnedCount, complete: family.complete };
}

function collectIdentifiers(value: unknown) {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  for (const group of value) {
    if (!isRecord(group) || !Array.isArray(group.identifiers)) continue;
    for (const identifier of group.identifiers) {
      if (!isRecord(identifier)) continue;
      const type = stringValue(identifier.identifierType);
      const id = stringValue(identifier.identifier);
      if (type && id) output.push(type + " · " + id);
    }
  }
  return output;
}

function extractFeeSummary(result: ApiResult | null): FeeSummary | null {
  if (!result?.ok || !isRecord(result.data)) return null;
  const payload = isRecord(result.data.payload) ? result.data.payload : result.data;
  const feeResult = isRecord(payload.FeesEstimateResult) ? payload.FeesEstimateResult : payload;
  const estimate = isRecord(feeResult.FeesEstimate) ? feeResult.FeesEstimate : null;
  if (!estimate) return null;
  const total = isRecord(estimate.TotalFeesEstimate) ? estimate.TotalFeesEstimate : {};
  const rawDetails = Array.isArray(estimate.FeeDetailList) ? estimate.FeeDetailList : [];
  return { status: stringValue(feeResult.Status) || "Completed", amount: numberValue(total.Amount), currency: stringValue(total.CurrencyCode) || "USD", details: rawDetails.filter(isRecord).map((detail) => { const amount = isRecord(detail.FinalFee) ? detail.FinalFee : isRecord(detail.FeeAmount) ? detail.FeeAmount : {}; return { type: stringValue(detail.FeeType) || "Fee", amount: numberValue(amount.Amount), currency: stringValue(amount.CurrencyCode) || stringValue(total.CurrencyCode) || "USD" }; }) };
}

function extractAmazonError(data: unknown) {
  if (!isRecord(data)) return "Amazon returned an error.";
  const errors = Array.isArray(data.errors) ? data.errors : [];
  const first = errors.find(isRecord);
  return first ? stringValue(first.message) || stringValue(first.code) || "Amazon returned an error." : "Amazon returned an error.";
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown) { return typeof value === "number" ? value : null; }
function formatMoney(value: number, currency: string) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); } catch { return currency + " " + value.toFixed(2); } }
function formatLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function toLocalDateTime(value: Date) { const offset = value.getTimezoneOffset() * 60_000; return new Date(value.getTime() - offset).toISOString().slice(0, 16); }
