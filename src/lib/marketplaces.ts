export type Marketplace = {
  id: string;
  name: string;
  region: "na" | "eu" | "fe";
  currency: string;
  locale: string;
};

export type SpApiEnvironment = "production" | "sandbox";

export const marketplaces: Marketplace[] = [
  { id: "ATVPDKIKX0DER", name: "United States", region: "na", currency: "USD", locale: "en_US" },
  { id: "A2EUQ1WTGCTBG2", name: "Canada", region: "na", currency: "CAD", locale: "en_CA" },
  { id: "A1AM78C64UM0Y8", name: "Mexico", region: "na", currency: "MXN", locale: "es_MX" },
  { id: "A2Q3Y263D00KWC", name: "Brazil", region: "na", currency: "BRL", locale: "pt_BR" },
  { id: "A28R8C7NBKEWEA", name: "Ireland", region: "eu", currency: "EUR", locale: "en_IE" },
  { id: "A1F83G8C2ARO7P", name: "United Kingdom", region: "eu", currency: "GBP", locale: "en_GB" },
  { id: "A1PA6795UKMFR9", name: "Germany", region: "eu", currency: "EUR", locale: "de_DE" },
  { id: "A13V1IB3VIYZZH", name: "France", region: "eu", currency: "EUR", locale: "fr_FR" },
  { id: "APJ6JRA9NG5V4", name: "Italy", region: "eu", currency: "EUR", locale: "it_IT" },
  { id: "A1RKKUPIHCS9HS", name: "Spain", region: "eu", currency: "EUR", locale: "es_ES" },
  { id: "A1805IZSGTT6HS", name: "Netherlands", region: "eu", currency: "EUR", locale: "nl_NL" },
  { id: "A2NODRKZP88ZB9", name: "Sweden", region: "eu", currency: "SEK", locale: "sv_SE" },
  { id: "AE08WJ6YKNBMC", name: "South Africa", region: "eu", currency: "ZAR", locale: "en_ZA" },
  { id: "A1C3SOZRARQ6R3", name: "Poland", region: "eu", currency: "PLN", locale: "pl_PL" },
  { id: "ARBP9OOSHTCHU", name: "Egypt", region: "eu", currency: "EGP", locale: "ar_EG" },
  { id: "A33AVAJ2PDY3EV", name: "Turkey", region: "eu", currency: "TRY", locale: "tr_TR" },
  { id: "A21TJRUUN4KGV", name: "India", region: "eu", currency: "INR", locale: "en_IN" },
  { id: "A2VIGQ35RCS4UG", name: "United Arab Emirates", region: "eu", currency: "AED", locale: "en_AE" },
  { id: "A17E79C6D8DWNP", name: "Saudi Arabia", region: "eu", currency: "SAR", locale: "ar_SA" },
  { id: "A1VC38T7YXB528", name: "Japan", region: "fe", currency: "JPY", locale: "ja_JP" },
  { id: "A39IBJ37TRP1C6", name: "Australia", region: "fe", currency: "AUD", locale: "en_AU" },
  { id: "A19VAU5U5O7RUS", name: "Singapore", region: "fe", currency: "SGD", locale: "en_SG" },
];

export const endpoints = {
  production: {
    na: "https://sellingpartnerapi-na.amazon.com",
    eu: "https://sellingpartnerapi-eu.amazon.com",
    fe: "https://sellingpartnerapi-fe.amazon.com",
  },
  sandbox: {
    na: "https://sandbox.sellingpartnerapi-na.amazon.com",
    eu: "https://sandbox.sellingpartnerapi-eu.amazon.com",
    fe: "https://sandbox.sellingpartnerapi-fe.amazon.com",
  },
} as const;

export function getMarketplace(id: string) {
  return marketplaces.find((marketplace) => marketplace.id === id);
}

export function getEndpoint(region: Marketplace["region"], environment: SpApiEnvironment = "production") {
  return endpoints[environment][region];
}
