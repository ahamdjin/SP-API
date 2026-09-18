"use client";

import Image from "next/image";
import {
  Archive,
  Braces,
  Check,
  Clipboard,
  ClipboardList,
  Database,
  Download,
  ExternalLink,
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
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ArrowRight,
  ShoppingCart,
  Tags,
  TerminalSquare,
  Truck,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { extractCatalogItems, type CatalogItemView, type DetailRow, type ProductImage } from "@/lib/catalog-view";
import { getMarketplace, marketplaces, type SpApiEnvironment } from "@/lib/marketplaces";

type Credentials = { clientId: string; clientSecret: string; refreshToken: string };
type ApiProblem = {
  code: string;
  message: string;
  details: string | null;
  action: string;
  retryable: boolean;
};
type ApiResult = {
  ok?: boolean; status?: number; statusText?: string; requestId?: string | null;
  gatewayId?: string | null; traceId?: string | null;
  rateLimit?: string | null; durationMs?: number; attempts?: number; data?: unknown; error?: string;
  details?: unknown; message?: string; expiresIn?: number; problem?: ApiProblem | null;
};
type Operation =
  | "catalog" | "fees" | "inventory" | "orders" | "order"
  | "reports" | "createReport" | "report" | "reportDocument"
  | "feeds" | "feed" | "feedDocument" | "submitFeed"
  | "inboundPlans" | "inboundPlan" | "inboundShipment" | "inboundOperationStatus"
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
      { id: "reportDocument", label: "Report document", description: "Download and inspect the generated report", icon: Archive, kind: "read" },
    ],
  },
  {
    label: "Feeds",
    items: [
      { id: "feeds", label: "List feeds", description: "Review feed jobs", icon: ListChecks, kind: "read" },
      { id: "feed", label: "Feed status", description: "Inspect a feed by ID", icon: FileSearch, kind: "read" },
      { id: "feedDocument", label: "Feed processing report", description: "Download and inspect record-level results", icon: FileSearch, kind: "read" },
      { id: "submitFeed", label: "Submit feed", description: "Upload and start a feed", icon: Send, kind: "write" },
    ],
  },
  {
    label: "FBA inbound",
    items: [
      { id: "inboundPlans", label: "List plans", description: "Active, shipped or voided plans", icon: Truck, kind: "read" },
      { id: "inboundPlan", label: "Get plan", description: "Inspect an inbound plan", icon: PackageCheck, kind: "read" },
      { id: "inboundShipment", label: "Get shipment", description: "Plan and shipment details", icon: Truck, kind: "read" },
      { id: "inboundOperationStatus", label: "Operation status", description: "Verify asynchronous inbound operations", icon: ListChecks, kind: "read" },
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
  const [environment, setEnvironment] = useState<SpApiEnvironment>("sandbox");
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
  const catalogItems = useMemo(() => extractCatalogItems(result?.data), [result]);
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

  function followOperation(nextOperation: Operation, patch: Record<string, FieldValue> = {}) {
    setFields((current) => ({ ...current, ...patch, confirmed: false }));
    setOperation(nextOperation);
    setResult(null);
    window.setTimeout(() => document.querySelector(".request-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function testConnection() {
    setConnectionState("testing");
    setConnectionMessage("Requesting token…");
    try {
      const response = await postJson("/api/sp-api/test", { ...credentials, marketplaceId, environment });
      if (!response.ok) {
        const guidance = response.problem?.action ? " — " + response.problem.action : "";
        throw new Error((response.problem?.code ? response.problem.code + ": " : "") + (response.problem?.message ?? response.error ?? "Connection failed") + guidance);
      }
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
    let payload: unknown = { ...credentials, marketplaceId, environment, operation, fields };
    if (operation === "catalog") {
      url = "/api/sp-api/catalog";
      payload = { ...credentials, marketplaceId, environment, ...catalog };
    }
    if (operation === "fees") {
      url = "/api/sp-api/fees";
      payload = {
        ...credentials,
        marketplaceId,
        environment,
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
            <Field label="Environment" required>
              <select required value={environment} onChange={(event) => { setEnvironment(event.target.value as SpApiEnvironment); setConnectionState("idle"); setConnectionMessage("Environment changed"); }}>
                <option value="sandbox">Sandbox · no production data</option>
                <option value="production">Production · live seller account</option>
              </select>
            </Field>
            <Field label="Marketplace" required>
              <select required value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>
                {marketplaces.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currency} · {item.id}</option>)}
              </select>
            </Field>
            <div className={"security-note " + (environment === "production" ? "production-warning" : "")}>
              <ShieldCheck size={16} />
              <p>{environment === "sandbox" ? "Sandbox calls use Amazon's mock/test endpoints and do not change production seller data." : "Production mode calls the live seller account. Keep write confirmations enabled and test the same workflow in Sandbox first."}</p>
            </div>
          </div>
          <button className="secondary-button full-width" type="submit" disabled={!credentialsComplete || connectionState === "testing"}>
            {connectionState === "testing" ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />} Test {environment} connection
          </button>
          <div className="security-note"><ShieldCheck size={16} /><p>This test verifies both LWA token exchange and a Sellers API call. AWS IAM keys are not required for normal SP-API requests.</p></div>
        </form>

        <section className="query-panel">
          <div className="workspace-heading">
            <div><span className="section-index">02</span><h2>Request builder</h2></div>
            <span className="region-label">{environment.toUpperCase()} · {marketplace.name} / {marketplace.region.toUpperCase()}</span>
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
              environment={environment}
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
              {result && <div className="request-meta">{typeof result.status === "number" && <span className={result.ok ? "status-success" : "status-error"}>{result.status} {result.statusText}</span>}{typeof result.durationMs === "number" && <span>{result.durationMs} ms</span>}{typeof result.attempts === "number" && result.attempts > 1 && <span>{result.attempts} attempts</span>}{result.rateLimit && <span>{result.rateLimit} req/s</span>}</div>}
            </div>
            {!result && !isLoading && <div className="empty-state"><Braces size={24} /><p>Run the selected operation to inspect Amazon&apos;s response.</p></div>}
            {isLoading && <div className="empty-state loading-state"><LoaderCircle className="spin" size={24} /><p>Waiting for Amazon…</p></div>}
            {result && !result.ok && <div className="error-banner"><X size={18} /><div><strong>{result.problem?.code ? "Request failed · " + result.problem.code : "Request failed"}</strong><p>{result.problem?.message ?? result.error ?? extractAmazonError(result.data)}</p>{result.problem?.details && <p><strong>Details:</strong> {result.problem.details}</p>}{result.problem?.action && <p><strong>What to do:</strong> {result.problem.action}</p>}{result.problem && <p><strong>Automatic retry:</strong> {result.problem.retryable ? "Safe with backoff." : "Not recommended until the cause/state is verified."}</p>}{result.requestId && <p><strong>Amazon request ID:</strong> <code>{result.requestId}</code></p>}{!result.requestId && result.gatewayId && <p><strong>Amazon gateway ID:</strong> <code>{result.gatewayId}</code></p>}</div></div>}
            {result?.ok && operation === "catalog" && <div className="catalog-results">
              {catalogFamily && <><div className={"family-summary " + (catalogFamily.complete ? "complete" : "partial")}><strong>{catalogFamily.returnedCount} of {catalogFamily.requestedCount} related records returned</strong><span>{catalogFamily.complete ? "Complete variation and package relationship graph" : "Partial related set — one or more related-ASIN calls failed"}</span></div>{catalogFamily.warnings.map((warning, index) => <div className="error-banner" key={warning.code + "-" + index}><X size={18} /><div><strong>Related product lookup · {warning.code}</strong><p>{warning.message}</p><p><strong>What to do:</strong> {warning.action}</p>{warning.requestId && <p><strong>Amazon request ID:</strong> <code>{warning.requestId}</code></p>}</div></div>)}</>}
              {catalogItems.length === 0 ? <p className="no-results">Amazon returned no catalogue items.</p> : <CatalogProductView key={catalogItems.map((item) => item.asin).join("|")} items={catalogItems} />}
            </div>}
            {result?.ok && operation === "fees" && feeSummary && <FeeResult summary={feeSummary} />}
            {result?.ok && operation !== "catalog" && operation !== "fees" && <OperationResult environment={environment} operation={operation} result={result} fields={fields} onFollow={followOperation} />}
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
  environment, operation, fields, updateField, catalog, setCatalog, fees, setFees, currency,
}: {
  environment: SpApiEnvironment;
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
      content = environment === "sandbox"
        ? <div className="dataset-note"><Check size={15} /><span>Static Sandbox uses Amazon&apos;s fixed list-reports fixture: FEE_DISCOUNTS_REPORT + GET_AFN_INVENTORY_DATA with IN_QUEUE + IN_PROGRESS. The workbench sends those exact parameters automatically.</span></div>
        : <>{text("reportTypes", "Report type(s)", "GET_FLAT_FILE_OPEN_LISTINGS_DATA", true)}{text("processingStatuses", "Processing statuses", "DONE,IN_PROGRESS")}{date("createdSince", "Created since")}{date("createdUntil", "Created until")}{text("pageSize", "Results per page", "20")}{text("reportNextToken", "Next-page token", "Optional · from the previous response")}</>;
      break;
    case "createReport":
      content = environment === "sandbox"
        ? <><div className="dataset-note"><Check size={15} /><span>Static Sandbox uses Amazon&apos;s official create-report fixture automatically: GET_MERCHANT_LISTINGS_ALL_DATA, start 2024-03-10T20:11:24.000Z, marketplaces Germany + US. A successful response returns report ID ID323.</span></div><Confirmation fields={fields} updateField={updateField} label="I understand this sends Amazon&apos;s fixed Sandbox report request." /></>
        : <>{text("reportType", "Report type", "GET_FLAT_FILE_OPEN_LISTINGS_DATA", true)}{date("dataStartTime", "Data start")}{date("dataEndTime", "Data end")}<Confirmation fields={fields} updateField={updateField} label="I understand this starts a report job in Amazon." /></>;
      break;
    case "report":
      content = <>{text("reportId", "Report ID", environment === "sandbox" ? "ID323" : "51665019712", true)}{environment === "sandbox" && <div className="dataset-note"><Check size={15} /><span>Use ID323 in Static Sandbox. Amazon&apos;s fixture returns an IN_PROGRESS example report.</span></div>}</>;
      break;
    case "reportDocument":
      content = <>{text("reportDocumentId", "Report document ID", environment === "sandbox" ? "0356cf79-b8b0-4226-b4b9-0ee058ea5760" : "amzn1.spdoc...", true)}{environment === "sandbox" && <div className="dataset-note"><Check size={15} /><span>The document fixture is independent of ID323. Use 0356cf79-b8b0-4226-b4b9-0ee058ea5760 to test document retrieval.</span></div>}</>;
      break;
    case "feeds":
      content = <>{text("feedTypes", "Feed type(s)", "JSON_LISTINGS_FEED", true)}{text("processingStatuses", "Processing statuses", "DONE,IN_PROGRESS")}{date("createdSince", "Created since")}{date("createdUntil", "Created until")}{text("pageSize", "Results per page", "20")}{text("feedNextToken", "Next-page token", "Optional · from the previous response")}</>;
      break;
    case "feed":
      content = text("feedId", "Feed ID", "123456789", true);
      break;
    case "feedDocument":
      content = <>{text("feedDocumentId", "Result feed document ID", "Use resultFeedDocumentId returned after the feed is DONE", true)}<div className="dataset-note"><Check size={15} /><span>Downloads a safe 2 MB text preview of Amazon&apos;s processing report so record-level errors are visible.</span></div></>;
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
    case "inboundOperationStatus":
      content = <>{text("operationId", "Operation ID", "1234abcd-1234-abcd-5678-1234abcd5678", true)}<div className="dataset-note"><Check size={15} /><span>Use the operationId returned by create/update inbound operations. SUCCESS confirms completion; inspect operationProblems for warnings or failures.</span></div></>;
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
      content = <>{text("shipmentId", "Shipment ID", "FBA123456789", true)}<Choice label="Label type" required options={["UNIQUE", "BARCODE_2D", "PALLET"]} value={value("shipmentLabelType")} onChange={(next) => updateField("shipmentLabelType", next)} />{text("shipmentPageType", "Page type", "Defaults to PackageLabel_Thermal_NonPCP")}{text("numberOfPackages", "Number of packages")}{text("numberOfPallets", "Number of pallets", "", palletLabels, palletLabels ? "Required for PALLET labels" : undefined)}{textarea("packageLabelsToPrint", "Package labels to print", "Optional · one CartonId / boxId per line")}{text("shipmentPageSize", "Page size", "Required for some non-partnered LTL label flows")}{text("pageStartIndex", "Page start index", "Required for some non-partnered LTL label flows")}</>;
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

function CatalogProductView({ items }: { items: CatalogItemView[] }) {
  const [selectedAsin, setSelectedAsin] = useState(items[0]?.asin ?? "");
  const item = items.find((candidate) => candidate.asin === selectedAsin) ?? items[0];
  if (!item) return null;

  const relatedLookup = new Set(items.map((candidate) => candidate.asin));
  return <div className="catalog-product-view">
    <div className="live-result-line"><span><span className="live-dot" />Live Amazon catalogue response</span><small>{items.length} product record{items.length === 1 ? "" : "s"}</small></div>

    {items.length > 1 && <nav className="related-products" aria-label="Returned catalogue records">
      <p>Returned products</p>
      <div>{items.map((candidate) => <button className={candidate.asin === item.asin ? "selected" : ""} key={candidate.asin} onClick={() => setSelectedAsin(candidate.asin)} type="button">
        <ProductThumb image={candidate.images[0]} title={candidate.title} />
        <span><strong>{candidate.asin}</strong><small>{candidate.title}</small></span>
      </button>)}</div>
    </nav>}

    <article className="product-detail">
      <ProductGallery images={item.images} title={item.title} />
      <div className="product-identity">
        <p className="product-brand">{item.brand || "Brand not returned by Amazon"}</p>
        <h3>{item.title}</h3>
        <div className="product-meta"><span>{formatLabel(item.productType)}</span><span>ASIN {item.asin}</span></div>
        {item.identifiers.length > 0 && <div className="identifier-list">{item.identifiers.map((identifier) => <span key={identifier}>{identifier}</span>)}</div>}
        <div className="dataset-coverage"><strong>{item.datasets.length}/10 data groups returned</strong><span>{item.datasets.map(formatLabel).join(" · ")}</span></div>
      </div>
    </article>

    <div className="product-information">
      <ProductSection title="Product details" count={item.overview.length} empty="Amazon did not return summary details for this product.">
        <DetailTable rows={item.overview} />
      </ProductSection>

      <ProductSection title="Specifications" count={item.attributes.length} empty="Amazon did not return product attributes for this product.">
        {item.attributes.length > 0 && <details className="attribute-details" open={item.attributes.length <= 24}>
          <summary>{item.attributes.length <= 24 ? "Specifications" : `View all ${item.attributes.length} specifications`}</summary>
          <DetailTable rows={item.attributes} />
        </details>}
      </ProductSection>

      <ProductSection title="Measurements" count={item.itemDimensions.length + item.packageDimensions.length} empty="Amazon did not return item or package dimensions.">
        {(item.itemDimensions.length > 0 || item.packageDimensions.length > 0) && <div className="measurement-columns">
          <div><h5>Item</h5><DetailTable rows={item.itemDimensions} /></div>
          <div><h5>Package</h5><DetailTable rows={item.packageDimensions} /></div>
        </div>}
      </ProductSection>

      <ProductSection title="Category and sales rank" count={item.classifications.length + item.salesRanks.length} empty="Amazon did not return category or sales-rank data.">
        {item.classifications.length > 0 && <DetailTable rows={item.classifications} />}
        {item.salesRanks.length > 0 && <div className="rank-list">{item.salesRanks.map((rank, index) => <div key={`${rank.title}-${rank.rank}-${index}`}><span><small>{rank.group}</small>{rank.title}</span><strong>#{new Intl.NumberFormat().format(rank.rank)}</strong></div>)}</div>}
      </ProductSection>

      <ProductSection title="Related products" count={item.relationships.length} empty="Amazon did not return variation or package relationships.">
        {item.relationships.length > 0 && <div className="relationship-list">{item.relationships.map((relationship, index) => {
          const label = <><span><strong>{relationship.direction}</strong>{relationship.type}{relationship.variationTheme ? ` · ${relationship.variationTheme}` : ""}</span><code>{relationship.asin}</code></>;
          return relatedLookup.has(relationship.asin)
            ? <button key={`${relationship.asin}-${index}`} onClick={() => setSelectedAsin(relationship.asin)} type="button">{label}</button>
            : <div key={`${relationship.asin}-${index}`}>{label}</div>;
        })}</div>}
      </ProductSection>

      <ProductSection title="Vendor details" count={item.vendorDetails.length} empty="Amazon did not return vendor-only details for this account or product.">
        <DetailTable rows={item.vendorDetails} />
      </ProductSection>
    </div>
  </div>;
}

function ProductGallery({ images, title }: { images: ProductImage[]; title: string }) {
  const [selectedImage, setSelectedImage] = useState(images[0]?.link ?? "");
  const active = images.find((image) => image.link === selectedImage) ?? images[0];
  return <div className="product-gallery-large">
    <div className="product-main-image">{active ? <Image alt={title} fill priority sizes="(max-width: 640px) 86vw, 380px" src={active.link} unoptimized /> : <div className="image-missing"><PackageSearch size={42} /><span>No image returned</span></div>}</div>
    {images.length > 1 && <div className="product-thumbnails" aria-label="Product images">{images.map((image, index) => <button aria-label={`View ${image.variant.toLowerCase()} image`} className={image.link === active?.link ? "selected" : ""} key={image.link} onClick={() => setSelectedImage(image.link)} type="button"><Image alt="" height={58} src={image.link} unoptimized width={58} /><span>{index + 1}</span></button>)}</div>}
  </div>;
}

function ProductThumb({ image, title }: { image?: ProductImage; title: string }) {
  return <span className="related-thumb">{image ? <Image alt="" height={48} src={image.link} unoptimized width={48} /> : <PackageSearch aria-label={title} size={20} />}</span>;
}

function ProductSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return <section className="product-section"><div className="product-section-heading"><h4>{title}</h4><span>{count}</span></div>{count > 0 ? children : <p className="section-empty">{empty}</p>}</section>;
}

function DetailTable({ rows }: { rows: DetailRow[] }) {
  if (rows.length === 0) return null;
  return <dl className="detail-table">{rows.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
}

type FeeSummary = { status: string; amount: number | null; currency: string; details: Array<{ type: string; amount: number | null; currency: string }> };
function FeeResult({ summary }: { summary: FeeSummary }) {
  return <div className="fee-result"><div className="fee-total"><span>Total estimated fees</span><strong>{summary.amount === null ? "—" : formatMoney(summary.amount, summary.currency)}</strong><small>{summary.status}</small></div><div className="fee-breakdown">{summary.details.length === 0 ? <p>No itemized fee components were returned.</p> : summary.details.map((detail, index) => <div className="fee-line" key={detail.type + "-" + index}><span>{detail.type}</span><strong>{detail.amount === null ? "—" : formatMoney(detail.amount, detail.currency)}</strong></div>)}</div></div>;
}


type FollowOperation = (operation: Operation, patch?: Record<string, FieldValue>) => void;
type ResultRow = { label: string; value: string };

function OperationResult({
  operation, result, environment, fields, onFollow,
}: {
  operation: Operation;
  result: ApiResult;
  environment: SpApiEnvironment;
  fields: Record<string, FieldValue>;
  onFollow: FollowOperation;
}) {
  const data = isRecord(result.data) ? result.data : {};
  const nextStep = stringValue(data.nextStep) || stringValue(data.verification);
  const documents = extractDocuments(data);
  const genericRows = topLevelRows(data);

  if (operation === "reportDocument" || operation === "feedDocument" || operation === "itemLabels" || operation === "shipmentLabels" || operation === "billOfLading") {
    return <div className="workflow-results">
      <SuccessLead title={operation === "feedDocument" ? "Processing report ready" : "Document response ready"} copy={nextStep || (documents.length ? "Amazon returned document information below." : "Amazon completed the document request.")} />
      <DocumentResults documents={documents} environment={environment} />
      {documents.length === 0 && <ResultDetails rows={genericRows} />}
    </div>;
  }

  if (operation === "createReport") {
    const reportId = stringValue(data.reportId);
    return <div className="workflow-results">
      <SuccessLead title="Report requested" copy={nextStep || "Amazon accepted the report request. The report document is created only after processing reaches DONE."} />
      <ResultDetails rows={[{ label: "Report ID", value: reportId || "Not returned" }]} />
      {reportId && <ActionRow>
        <button className="workflow-action primary" type="button" onClick={() => onFollow("report", { reportId })}><RefreshCw size={15} /> Check report status</button>
        {environment === "sandbox" && <button className="workflow-action" type="button" onClick={() => onFollow("reportDocument", { reportDocumentId: "0356cf79-b8b0-4226-b4b9-0ee058ea5760" })}><Download size={15} /> Open sandbox document example</button>}
      </ActionRow>}
      {environment === "sandbox" && <SandboxFlowNote>Amazon&apos;s static Report fixtures are independent: <code>ID323</code> stays IN_PROGRESS, while the document fixture uses <code>0356cf79-b8b0-4226-b4b9-0ee058ea5760</code>. Production chains the real report ID to its real document ID.</SandboxFlowNote>}
    </div>;
  }

  if (operation === "report") {
    const reportId = stringValue(data.reportId) || stringFieldValue(fields, "reportId");
    const status = stringValue(data.processingStatus) || "UNKNOWN";
    const documentId = stringValue(data.reportDocumentId);
    return <div className="workflow-results">
      <StatusHero label="Report status" status={status} id={reportId} />
      <ResultDetails rows={rowsFrom(data, ["reportType", "dataStartTime", "dataEndTime", "createdTime", "processingStartTime", "processingEndTime", "reportDocumentId"])} />
      <ActionRow>
        {(status === "IN_QUEUE" || status === "IN_PROGRESS") && reportId && <button className="workflow-action primary" type="button" onClick={() => onFollow("report", { reportId })}><RefreshCw size={15} /> Check again</button>}
        {documentId && <button className="workflow-action primary" type="button" onClick={() => onFollow("reportDocument", { reportDocumentId: documentId })}><Download size={15} /> Get report document</button>}
        {environment === "sandbox" && !documentId && <button className="workflow-action" type="button" onClick={() => onFollow("reportDocument", { reportDocumentId: "0356cf79-b8b0-4226-b4b9-0ee058ea5760" })}><Download size={15} /> Open sandbox document fixture</button>}
      </ActionRow>
      {nextStep && <WorkflowNote>{nextStep}</WorkflowNote>}
    </div>;
  }

  if (operation === "reports") {
    const reports = arrayRecords(data.reports);
    return <div className="workflow-results">
      <SuccessLead title={String(reports.length) + " report job" + (reports.length === 1 ? "" : "s") + " returned"} copy="Pick a report to inspect its current processing state. DONE reports can expose a document ID." />
      <RecordList records={reports} idKey="reportId" titleKey="reportType" statusKey="processingStatus" onOpen={(record) => {
        const reportId = stringValue(record.reportId);
        if (reportId) onFollow("report", { reportId });
      }} actionLabel="Open status" />
      {reports.length === 0 && <ResultDetails rows={genericRows} />}
    </div>;
  }

  if (operation === "submitFeed") {
    const feedId = stringValue(data.feedId);
    return <div className="workflow-results">
      <SuccessLead title="Feed submitted" copy={nextStep || "Amazon accepted the feed. Processing happens asynchronously."} />
      <ResultDetails rows={rowsFrom(data, ["feedId", "inputFeedDocumentId", "createdTime"])} />
      {feedId && <ActionRow><button className="workflow-action primary" type="button" onClick={() => onFollow("feed", { feedId })}><RefreshCw size={15} /> Check feed status</button></ActionRow>}
    </div>;
  }

  if (operation === "feed") {
    const feedId = stringValue(data.feedId) || stringFieldValue(fields, "feedId");
    const status = stringValue(data.processingStatus) || "UNKNOWN";
    const documentId = stringValue(data.resultFeedDocumentId);
    return <div className="workflow-results">
      <StatusHero label="Feed status" status={status} id={feedId} />
      <ResultDetails rows={rowsFrom(data, ["feedType", "createdTime", "processingStartTime", "processingEndTime", "resultFeedDocumentId"])} />
      <ActionRow>
        {(status === "IN_QUEUE" || status === "IN_PROGRESS") && feedId && <button className="workflow-action primary" type="button" onClick={() => onFollow("feed", { feedId })}><RefreshCw size={15} /> Check again</button>}
        {documentId && <button className="workflow-action primary" type="button" onClick={() => onFollow("feedDocument", { feedDocumentId: documentId })}><FileSearch size={15} /> Open processing report</button>}
      </ActionRow>
      {nextStep && <WorkflowNote>{nextStep}</WorkflowNote>}
    </div>;
  }

  if (operation === "feeds") {
    const feeds = arrayRecords(data.feeds);
    return <div className="workflow-results">
      <SuccessLead title={String(feeds.length) + " feed job" + (feeds.length === 1 ? "" : "s") + " returned"} copy="Open a feed to inspect processing and its result document." />
      <RecordList records={feeds} idKey="feedId" titleKey="feedType" statusKey="processingStatus" onOpen={(record) => {
        const feedId = stringValue(record.feedId);
        if (feedId) onFollow("feed", { feedId });
      }} actionLabel="Open status" />
      {feeds.length === 0 && <ResultDetails rows={genericRows} />}
    </div>;
  }

  if (operation === "createInboundPlan") {
    const inboundPlanId = stringValue(data.inboundPlanId);
    const operationId = stringValue(data.operationId);
    return <div className="workflow-results">
      <SuccessLead title="Inbound plan creation started" copy={nextStep || "Amazon returned both the plan ID and asynchronous operation ID."} />
      <ResultDetails rows={rowsFrom(data, ["inboundPlanId", "operationId"])} />
      <ActionRow>
        {operationId && <button className="workflow-action primary" type="button" onClick={() => onFollow("inboundOperationStatus", { operationId, ...(inboundPlanId ? { inboundPlanId } : {}) })}><RefreshCw size={15} /> Check operation status</button>}
        {inboundPlanId && <button className="workflow-action" type="button" onClick={() => onFollow("inboundPlan", { inboundPlanId })}><ArrowRight size={15} /> Open inbound plan</button>}
      </ActionRow>
    </div>;
  }

  if (operation === "inboundOperationStatus") {
    const status = stringValue(data.operationStatus) || "UNKNOWN";
    const operationId = stringFieldValue(fields, "operationId");
    return <div className="workflow-results">
      <StatusHero label="Inbound operation" status={status} id={operationId} />
      <ResultDetails rows={rowsFrom(data, ["operationStatus"])} />
      {Array.isArray(data.operationProblems) && data.operationProblems.length > 0 && <pre className="document-preview"><code>{JSON.stringify(data.operationProblems, null, 2)}</code></pre>}
      <ActionRow>
        {status === "IN_PROGRESS" && operationId && <button className="workflow-action primary" type="button" onClick={() => onFollow("inboundOperationStatus", { operationId })}><RefreshCw size={15} /> Check again</button>}
        {status === "SUCCESS" && stringFieldValue(fields, "inboundPlanId") && <button className="workflow-action primary" type="button" onClick={() => onFollow("inboundPlan", { inboundPlanId: stringFieldValue(fields, "inboundPlanId") })}><ArrowRight size={15} /> Open inbound plan</button>}
      </ActionRow>
      {nextStep && <WorkflowNote>{nextStep}</WorkflowNote>}
    </div>;
  }

  if (operation === "inboundPlans") {
    const plans = arrayRecords(data.inboundPlans);
    return <div className="workflow-results">
      <SuccessLead title={String(plans.length) + " inbound plan" + (plans.length === 1 ? "" : "s") + " returned"} copy="Open a plan to inspect its shipments and current state." />
      <RecordList records={plans} idKey="inboundPlanId" titleKey="name" statusKey="status" onOpen={(record) => {
        const inboundPlanId = stringValue(record.inboundPlanId);
        if (inboundPlanId) onFollow("inboundPlan", { inboundPlanId });
      }} actionLabel="Open plan" />
      {plans.length === 0 && <ResultDetails rows={genericRows} />}
    </div>;
  }

  if (operation === "inboundPlan") {
    const inboundPlanId = stringValue(data.inboundPlanId) || stringFieldValue(fields, "inboundPlanId");
    const shipments = arrayRecords(data.shipments);
    return <div className="workflow-results">
      <StatusHero label={stringValue(data.name) || "Inbound plan"} status={stringValue(data.status) || "UNKNOWN"} id={inboundPlanId} />
      <ResultDetails rows={rowsFrom(data, ["createdAt", "lastUpdatedAt", "marketplaceIds"])} />
      {shipments.length > 0 && <RecordList records={shipments} idKey="shipmentId" titleKey="name" statusKey="status" onOpen={(record) => {
        const shipmentId = stringValue(record.shipmentId);
        if (shipmentId && inboundPlanId) onFollow("inboundShipment", { inboundPlanId, shipmentId });
      }} actionLabel="Open shipment" />}
    </div>;
  }

  if (operation === "orders") {
    const orders = arrayRecords(data.orders);
    return <div className="workflow-results">
      <SuccessLead title={String(orders.length) + " order" + (orders.length === 1 ? "" : "s") + " returned"} copy="Open an order to inspect the full Amazon response." />
      <RecordList records={orders} idKey="amazonOrderId" titleKey="amazonOrderId" statusKey="orderStatus" onOpen={(record) => {
        const orderId = stringValue(record.amazonOrderId) || stringValue(record.orderId);
        if (orderId) onFollow("order", { orderId });
      }} actionLabel="Open order" />
      {orders.length === 0 && <ResultDetails rows={genericRows} />}
    </div>;
  }

  if (operation === "inventory") {
    const inventory = arrayRecords(data.inventorySummaries);
    return <div className="workflow-results">
      <SuccessLead title={String(inventory.length) + " inventory record" + (inventory.length === 1 ? "" : "s") + " returned"} copy="Current FBA inventory summaries from Amazon." />
      <CompactTable records={inventory} preferredKeys={["sellerSku", "asin", "fnSku", "condition", "totalQuantity"]} />
      {inventory.length === 0 && <ResultDetails rows={genericRows} />}
    </div>;
  }

  if (operation === "prepDetails") {
    const prep = arrayRecords(data.mskuPrepDetails);
    const items = prep.length ? prep : arrayRecords(data.items);
    return <div className="workflow-results">
      <SuccessLead title={String(items.length) + " prep record" + (items.length === 1 ? "" : "s") + " returned"} copy="Prep instructions returned by Amazon." />
      <CompactTable records={items} preferredKeys={["msku", "asin", "fnsku", "prepCategory", "prepTypes"]} />
      {items.length === 0 && <ResultDetails rows={genericRows} />}
    </div>;
  }

  if (operation === "order" || operation === "inboundShipment") {
    return <div className="workflow-results">
      <SuccessLead title={operation === "order" ? "Order returned" : "Shipment returned"} copy={nextStep || "Amazon returned the requested resource."} />
      <ResultDetails rows={genericRows} />
    </div>;
  }

  return <div className="workflow-results">
    <SuccessLead title="Amazon returned a successful response" copy={nextStep || "The most useful fields are shown below. The full JSON remains available in the Response inspector."} />
    {documents.length > 0 && <DocumentResults documents={documents} environment={environment} />}
    <ResultDetails rows={genericRows} />
  </div>;
}

function SuccessLead({ title, copy }: { title: string; copy: string }) {
  return <div className="success-summary"><Check size={18} /><div><strong>{title}</strong><p>{copy}</p></div></div>;
}

function StatusHero({ label, status, id }: { label: string; status: string; id?: string }) {
  const normalized = status.toUpperCase();
  const className = normalized === "DONE" || normalized === "SUCCESS" || normalized === "ACTIVE" ? "good" : normalized === "FATAL" || normalized === "FAILED" || normalized === "CANCELLED" ? "bad" : "pending";
  return <div className="status-hero"><div><span>{label}</span><strong>{status}</strong></div>{id && <code>{id}</code>}<span className={"status-pill " + className}>{status}</span></div>;
}

function ResultDetails({ rows }: { rows: ResultRow[] }) {
  if (!rows.length) return null;
  return <dl className="workflow-details">{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="workflow-actions">{children}</div>;
}

function WorkflowNote({ children }: { children: React.ReactNode }) {
  return <div className="workflow-note"><FileSearch size={16} /><p>{children}</p></div>;
}

function SandboxFlowNote({ children }: { children: React.ReactNode }) {
  return <div className="sandbox-flow-note"><ShieldCheck size={16} /><p>{children}</p></div>;
}

function RecordList({
  records, idKey, titleKey, statusKey, onOpen, actionLabel,
}: {
  records: Record<string, unknown>[];
  idKey: string;
  titleKey: string;
  statusKey: string;
  onOpen: (record: Record<string, unknown>) => void;
  actionLabel: string;
}) {
  if (!records.length) return null;
  return <div className="record-list">{records.map((record, index) => {
    const id = displayValue(record[idKey]) || "Record " + String(index + 1);
    const title = displayValue(record[titleKey]) || id;
    const status = displayValue(record[statusKey]);
    return <article key={id + "-" + String(index)}><div><small>{status || "Amazon record"}</small><strong>{title}</strong>{title !== id && <code>{id}</code>}</div><button className="workflow-action" type="button" onClick={() => onOpen(record)}>{actionLabel}<ArrowRight size={14} /></button></article>;
  })}</div>;
}

function CompactTable({ records, preferredKeys }: { records: Record<string, unknown>[]; preferredKeys: string[] }) {
  if (!records.length) return null;
  const keys = preferredKeys.filter((key) => records.some((record) => record[key] !== undefined)).slice(0, 5);
  const columns = keys.length ? keys : Object.keys(records[0]).filter((key) => isScalar(records[0][key])).slice(0, 5);
  return <div className="compact-table-wrap"><table className="compact-table"><thead><tr>{columns.map((key) => <th key={key}>{formatLabel(key)}</th>)}</tr></thead><tbody>{records.map((record, index) => <tr key={index}>{columns.map((key) => <td key={key}>{displayValue(record[key]) || "—"}</td>)}</tr>)}</tbody></table></div>;
}

type DocumentView = {
  label: string;
  url: string;
  contentType: string;
  content: string;
  bytesRead: number | null;
  truncated: boolean;
};

function DocumentResults({ documents, environment }: { documents: DocumentView[]; environment: SpApiEnvironment }) {
  if (!documents.length) return <div className="workflow-note"><FileSearch size={16} /><p>Amazon returned no downloadable document URL in this response.</p></div>;
  return <div className="document-results">{documents.map((document, index) => {
    const href = safeDocumentHref(document.url);
    return <article className="document-card" key={document.url + "-" + String(index)}>
      <div className="document-card-heading"><div><span>{"Document " + String(index + 1)}</span><strong>{document.label}</strong></div>{document.contentType && <code>{document.contentType}</code>}</div>
      <div className="document-meta">{document.bytesRead !== null && <span>{new Intl.NumberFormat().format(document.bytesRead)} bytes read</span>}{document.truncated && <span>Preview truncated</span>}{environment === "sandbox" && !document.content && <span>Static sandbox may return a mock URL rather than a real file.</span>}</div>
      {href ? <a className="workflow-action primary document-download" href={href} target="_blank" rel="noreferrer"><Download size={15} /> Open / download original <ExternalLink size={13} /></a> : <p className="document-unavailable">Amazon returned a non-HTTPS or placeholder document URL, so the workbench will not open it.</p>}
      {document.content && <pre className="document-preview"><code>{document.content}</code></pre>}
    </article>;
  })}</div>;
}

function extractDocuments(data: Record<string, unknown>): DocumentView[] {
  const output: DocumentView[] = [];
  const downloaded = isRecord(data.downloaded) ? data.downloaded : {};
  const directUrl = stringValue(data.url);
  if (directUrl) {
    output.push({
      label: stringValue(data.reportDocumentId) || stringValue(data.feedDocumentId) || "Amazon document",
      url: directUrl,
      contentType: stringValue(downloaded.contentType),
      content: stringValue(downloaded.content),
      bytesRead: numberValue(downloaded.bytesRead),
      truncated: downloaded.truncated === true,
    });
  }

  if (Array.isArray(data.documentDownloads)) {
    data.documentDownloads.filter(isRecord).forEach((document, index) => {
      const url = stringValue(document.uri);
      if (!url) return;
      output.push({
        label: "Amazon label file " + String(index + 1),
        url,
        contentType: "",
        content: "",
        bytesRead: null,
        truncated: false,
      });
    });
  }

  const payload = isRecord(data.payload) ? data.payload : {};
  const legacyUrl = stringValue(payload.DownloadURL) || stringValue(payload.downloadURL) || stringValue(payload.downloadUrl);
  if (legacyUrl) {
    output.push({
      label: "Amazon generated document",
      url: legacyUrl,
      contentType: "",
      content: "",
      bytesRead: null,
      truncated: false,
    });
  }
  return output;
}

function safeDocumentHref(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function topLevelRows(data: Record<string, unknown>) {
  return Object.entries(data)
    .filter(([key, value]) => key !== "downloaded" && key !== "nextStep" && key !== "verification" && isScalar(value))
    .slice(0, 14)
    .map(([key, value]) => ({ label: formatLabel(key), value: displayValue(value) }));
}

function rowsFrom(data: Record<string, unknown>, keys: string[]) {
  return keys.flatMap((key) => {
    const value = displayValue(data[key]);
    return value ? [{ label: formatLabel(key), value }] : [];
  });
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isScalar(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item)));
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) return value.join(", ");
  return "";
}

function stringFieldValue(fields: Record<string, FieldValue>, key: string) {
  return typeof fields[key] === "string" ? fields[key] as string : "";
}

async function postJson(url: string, payload: unknown): Promise<ApiResult> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json() as ApiResult;
  if (!response.ok && !data.error) data.error = "Request failed with status " + response.status;
  return data;
}

type CatalogWarning = { code: string; message: string; action: string; requestId: string | null };
type CatalogFamily = { requestedCount: number; returnedCount: number; complete: boolean; warnings: CatalogWarning[] };
function extractCatalogFamily(result: ApiResult | null): CatalogFamily | null {
  if (!result?.ok || !isRecord(result.data) || !isRecord(result.data.family)) return null;
  const family = result.data.family;
  if (typeof family.requestedCount !== "number" || typeof family.returnedCount !== "number" || typeof family.complete !== "boolean") return null;
  const rawWarnings = Array.isArray(family.warnings) ? family.warnings.filter(isRecord) : [];
  const warnings = rawWarnings.map((warning) => ({
    code: stringValue(warning.code) || "RELATED_LOOKUP_FAILED",
    message: stringValue(warning.message) || "Amazon did not return this related item.",
    action: stringValue(warning.action) || "Review the Amazon error and retry the related lookup.",
    requestId: stringValue(warning.requestId) || null,
  }));
  return { requestedCount: family.requestedCount, returnedCount: family.returnedCount, complete: family.complete, warnings };
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
