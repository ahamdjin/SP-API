"use client";

import {
  Braces, Check, Clipboard, Eye, EyeOff, KeyRound,
  LoaderCircle, PackageSearch, ReceiptText, Search, ShieldCheck,
  TerminalSquare, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import { getMarketplace, marketplaces } from "@/lib/marketplaces";

type Credentials = { clientId: string; clientSecret: string; refreshToken: string };
type ApiResult = {
  ok?: boolean; status?: number; statusText?: string; requestId?: string | null;
  rateLimit?: string | null; durationMs?: number; data?: unknown; error?: string;
  details?: unknown; message?: string; expiresIn?: number;
};
type WorkspaceTab = "catalog" | "fees";

const initialCredentials: Credentials = { clientId: "", clientSecret: "", refreshToken: "" };

export function Workbench() {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [showSecrets, setShowSecrets] = useState(false);
  const [marketplaceId, setMarketplaceId] = useState("ATVPDKIKX0DER");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("catalog");
  const [connectionState, setConnectionState] = useState<"idle" | "testing" | "ready" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState("Not tested");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [catalog, setCatalog] = useState({ mode: "identifier" as "identifier" | "keywords", identifierType: "ASIN", query: "", sellerId: "" });
  const [fees, setFees] = useState({ idType: "ASIN" as "ASIN" | "SKU", identifier: "", price: "", shipping: "0", isAmazonFulfilled: true });

  const marketplace = useMemo(() => getMarketplace(marketplaceId) ?? marketplaces[0], [marketplaceId]);
  const catalogItems = useMemo(() => extractCatalogItems(result), [result]);
  const feeSummary = useMemo(() => extractFeeSummary(result), [result]);
  const credentialsComplete = Object.values(credentials).every((value) => value.trim().length > 0);

  function updateCredential(key: keyof Credentials, value: string) {
    setCredentials((current) => ({ ...current, [key]: value }));
    if (connectionState !== "idle") {
      setConnectionState("idle");
      setConnectionMessage("Credentials changed");
    }
  }

  async function testConnection() {
    setConnectionState("testing");
    setConnectionMessage("Requesting token…");
    try {
      const response = await postJson("/api/sp-api/test", credentials);
      if (!response.ok) throw new Error(response.error ?? "Connection failed");
      setConnectionState("ready");
      setConnectionMessage(`Connected · token valid ${Math.round((response.expiresIn ?? 3600) / 60)} min`);
    } catch (error) {
      setConnectionState("error");
      setConnectionMessage(error instanceof Error ? error.message : "Connection failed");
    }
  }

  async function runCatalogSearch(event: FormEvent) {
    event.preventDefault();
    await runRequest("/api/sp-api/catalog", { ...credentials, marketplaceId, ...catalog });
  }

  async function runFeeEstimate(event: FormEvent) {
    event.preventDefault();
    await runRequest("/api/sp-api/fees", {
      ...credentials, marketplaceId, ...fees, currency: marketplace.currency,
      price: Number(fees.price), shipping: Number(fees.shipping),
    });
  }

  async function runRequest(url: string, payload: unknown) {
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
          <span className="read-only-badge"><ShieldCheck size={14} /> Read-only workspace</span>
          <span className={`connection-dot ${connectionState}`} />
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
          <p className="panel-copy">Credentials stay in this browser tab and are sent only to this server for the current request.</p>
          <div className="field-stack">
            <Field label="LWA client ID"><input name="clientId" autoComplete="off" placeholder="amzn1.application-oa2-client…" type={showSecrets ? "text" : "password"} value={credentials.clientId} onChange={(event) => updateCredential("clientId", event.target.value)} /></Field>
            <Field label="LWA client secret"><input name="clientSecret" autoComplete="off" placeholder="Enter client secret" type={showSecrets ? "text" : "password"} value={credentials.clientSecret} onChange={(event) => updateCredential("clientSecret", event.target.value)} /></Field>
            <Field label="Refresh token"><textarea name="refreshToken" autoComplete="off" className="token-field" placeholder="Atzr|…" rows={3} value={credentials.refreshToken} onChange={(event) => updateCredential("refreshToken", event.target.value)} style={showSecrets ? undefined : { WebkitTextSecurity: "disc" } as React.CSSProperties} /></Field>
            <Field label="Marketplace">
              <div className="choice-grid marketplace-choices" role="radiogroup" aria-label="Marketplace">
                {marketplaces.map((item) => (
                  <button
                    aria-checked={marketplaceId === item.id}
                    className={marketplaceId === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => setMarketplaceId(item.id)}
                    role="radio"
                    type="button"
                  >
                    <strong>{item.name}</strong>
                    <small>{item.currency} · {item.region.toUpperCase()}</small>
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <button className="secondary-button full-width" type="submit" disabled={!credentialsComplete || connectionState === "testing"}>{connectionState === "testing" ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />} Test credentials</button>
          <div className="security-note"><ShieldCheck size={16} /><p>No AWS access key or IAM role is required by Amazon&apos;s current SP-API connection flow.</p></div>
        </form>

        <section className="query-panel">
          <div className="workspace-heading">
            <div><span className="section-index">02</span><h2>Request builder</h2></div>
            <div className="tab-list" role="tablist" aria-label="SP-API tools">
              <button aria-selected={activeTab === "catalog"} className={activeTab === "catalog" ? "active" : ""} onClick={() => setActiveTab("catalog")} role="tab" type="button"><PackageSearch size={16} /> Catalogue</button>
              <button aria-selected={activeTab === "fees"} className={activeTab === "fees" ? "active" : ""} onClick={() => setActiveTab("fees")} role="tab" type="button"><ReceiptText size={16} /> Fees</button>
            </div>
          </div>

          {activeTab === "catalog" ? (
            <form className="request-form" onSubmit={runCatalogSearch}>
              <div className="request-intro"><div><p className="route-label">GET · Catalog Items 2022-04-01</p><h3>Find and inspect Amazon catalogue records</h3></div><span className="region-label">{marketplace.name} / {marketplace.region.toUpperCase()}</span></div>
              <div className="segmented-control"><button type="button" className={catalog.mode === "identifier" ? "selected" : ""} onClick={() => setCatalog((current) => ({ ...current, mode: "identifier" }))}>Identifier</button><button type="button" className={catalog.mode === "keywords" ? "selected" : ""} onClick={() => setCatalog((current) => ({ ...current, mode: "keywords" }))}>Keywords</button></div>
              <div className="form-grid">
                {catalog.mode === "identifier" && <Field label="Identifier type"><div className="choice-grid identifier-choices" role="radiogroup" aria-label="Identifier type">{["ASIN", "UPC", "EAN", "GTIN", "ISBN", "SKU", "JAN", "MINSAN"].map((type) => <button aria-checked={catalog.identifierType === type} className={catalog.identifierType === type ? "selected" : ""} key={type} onClick={() => setCatalog((current) => ({ ...current, identifierType: type }))} role="radio" type="button">{type}</button>)}</div></Field>}
                <Field label={catalog.mode === "keywords" ? "Search terms" : "Product identifier(s)"} wide={catalog.mode === "keywords"}><input placeholder={catalog.mode === "keywords" ? "wireless barcode scanner" : "One value, or up to 20 separated by commas"} value={catalog.query} onChange={(event) => setCatalog((current) => ({ ...current, query: event.target.value }))} required /></Field>
                {catalog.mode === "identifier" && catalog.identifierType === "SKU" && <Field label="Seller ID"><input placeholder="A1XXXXXXXXXXXX" value={catalog.sellerId} onChange={(event) => setCatalog((current) => ({ ...current, sellerId: event.target.value }))} required /></Field>}
              </div>
              <button className="primary-button" disabled={!credentialsComplete || isLoading}>{isLoading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} Search catalogue</button>
            </form>
          ) : (
            <form className="request-form" onSubmit={runFeeEstimate}>
              <div className="request-intro"><div><p className="route-label">POST · Product Fees v0</p><h3>Estimate Amazon selling and fulfilment fees</h3></div><span className="region-label">{marketplace.currency}</span></div>
              <div className="form-grid three-column">
                <Field label="Lookup by"><div className="choice-grid identifier-choices two-options" role="radiogroup" aria-label="Fee lookup type">{(["ASIN", "SKU"] as const).map((type) => <button aria-checked={fees.idType === type} className={fees.idType === type ? "selected" : ""} key={type} onClick={() => setFees((current) => ({ ...current, idType: type }))} role="radio" type="button">{type}</button>)}</div></Field>
                <Field label={fees.idType}><input placeholder={fees.idType === "ASIN" ? "B0XXXXXXXX" : "SELLER-SKU"} value={fees.identifier} onChange={(event) => setFees((current) => ({ ...current, identifier: event.target.value }))} required /></Field>
                <Field label={`Listing price · ${marketplace.currency}`}><input type="number" min="0.01" step="0.01" placeholder="29.99" value={fees.price} onChange={(event) => setFees((current) => ({ ...current, price: event.target.value }))} required /></Field>
                <Field label={`Shipping · ${marketplace.currency}`}><input type="number" min="0" step="0.01" value={fees.shipping} onChange={(event) => setFees((current) => ({ ...current, shipping: event.target.value }))} required /></Field>
                <Field label="Fulfilment"><div className="segmented-control compact"><button type="button" className={fees.isAmazonFulfilled ? "selected" : ""} onClick={() => setFees((current) => ({ ...current, isAmazonFulfilled: true }))}>FBA</button><button type="button" className={!fees.isAmazonFulfilled ? "selected" : ""} onClick={() => setFees((current) => ({ ...current, isAmazonFulfilled: false }))}>Merchant</button></div></Field>
              </div>
              <button className="primary-button" disabled={!credentialsComplete || isLoading}>{isLoading ? <LoaderCircle className="spin" size={17} /> : <ReceiptText size={17} />} Estimate fees</button>
            </form>
          )}

          <div className="result-area">
            <div className="result-heading"><div><span className="section-index">03</span><h2>Result</h2></div>{result && <div className="request-meta">{typeof result.status === "number" && <span className={result.ok ? "status-success" : "status-error"}>{result.status} {result.statusText}</span>}{typeof result.durationMs === "number" && <span>{result.durationMs} ms</span>}{result.rateLimit && <span>{result.rateLimit} req/s</span>}</div>}</div>
            {!result && !isLoading && <div className="empty-state"><Braces size={24} /><p>Run a request to inspect structured results and the complete Amazon response.</p></div>}
            {isLoading && <div className="empty-state loading-state"><LoaderCircle className="spin" size={24} /><p>Waiting for Amazon…</p></div>}
            {result && !result.ok && <div className="error-banner"><X size={18} /><div><strong>Request failed</strong><p>{result.error ?? extractAmazonError(result.data)}</p></div></div>}
            {result?.ok && activeTab === "catalog" && <div className="catalog-results">{catalogItems.length === 0 ? <p className="no-results">Amazon returned no catalogue items.</p> : catalogItems.map((item) => <CatalogResult key={item.asin} item={item} />)}</div>}
            {result?.ok && activeTab === "fees" && feeSummary && <FeeResult summary={feeSummary} />}
          </div>
        </section>

        <aside className="inspector-panel">
          <div className="panel-heading inspector-heading"><div><span className="section-index">04</span><h2>Response inspector</h2></div><button className="icon-button" type="button" disabled={!result} onClick={copyResponse} aria-label="Copy JSON response">{copied ? <Check size={17} /> : <Clipboard size={17} />}</button></div>
          <div className="inspector-meta"><span>JSON</span><span>{result?.requestId ? `Request ${result.requestId}` : "No request"}</span></div>
          <pre className="json-viewer"><code>{result ? JSON.stringify(result, null, 2) : "// Amazon's raw response will appear here.\n// Credentials are never included."}</code></pre>
        </aside>
      </div>
    </main>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span>{children}</label>; }

type CatalogItem = { asin: string; title: string; brand: string; productType: string; image: string | null; identifiers: string[] };
function CatalogResult({ item }: { item: CatalogItem }) { return <article className="catalog-item"><div className="product-image">{item.image ? <Image src={item.image} alt="" width={86} height={86} unoptimized /> : <PackageSearch size={28} />}</div><div className="product-copy"><div className="product-kicker"><span>{item.productType}</span><span>{item.asin}</span></div><h4>{item.title}</h4><p>{item.brand || "Brand not returned"}</p>{item.identifiers.length > 0 && <div className="identifier-list">{item.identifiers.slice(0, 4).map((identifier) => <span key={identifier}>{identifier}</span>)}</div>}</div></article>; }

type FeeSummary = { status: string; amount: number | null; currency: string; details: Array<{ type: string; amount: number | null; currency: string }> };
function FeeResult({ summary }: { summary: FeeSummary }) { return <div className="fee-result"><div className="fee-total"><span>Total estimated fees</span><strong>{summary.amount === null ? "—" : formatMoney(summary.amount, summary.currency)}</strong><small>{summary.status}</small></div><div className="fee-breakdown">{summary.details.length === 0 ? <p>No itemized fee components were returned.</p> : summary.details.map((detail, index) => <div className="fee-line" key={`${detail.type}-${index}`}><span>{detail.type}</span><strong>{detail.amount === null ? "—" : formatMoney(detail.amount, detail.currency)}</strong></div>)}</div></div>; }

async function postJson(url: string, payload: unknown): Promise<ApiResult> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json() as ApiResult;
  if (!response.ok && !data.error) data.error = `Request failed with status ${response.status}`;
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
    const image = imageList.find((entry) => isRecord(entry) && entry.variant === "MAIN") ?? imageList.find(isRecord);
    const productTypes = Array.isArray(raw.productTypes) ? raw.productTypes : [];
    const productType = productTypes.find(isRecord);
    return { asin: raw.asin, title: stringValue(summary.itemName) || "Untitled catalogue item", brand: stringValue(summary.brand), productType: productType ? stringValue(productType.productType) || "PRODUCT" : "PRODUCT", image: image && isRecord(image) ? stringValue(image.link) || null : null, identifiers: collectIdentifiers(raw.identifiers) };
  }).filter((item): item is CatalogItem => item !== null);
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
      if (type && id) output.push(`${type} · ${id}`);
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
function formatMoney(value: number, currency: string) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); } catch { return `${currency} ${value.toFixed(2)}`; } }
