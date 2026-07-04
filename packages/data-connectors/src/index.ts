import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ArkhamIntel,
  ContractRiskData,
  DexLiquidityData,
  DexPair,
  HolderConcentrationData,
  MarketData,
  OnchainData,
  ProviderStatus,
  ResolvedAsset,
  SourceCandidate
} from "@sp-agent/shared";
import { createPublicClient, http, toFunctionSelector, type Address } from "viem";
import { arbitrum, base, bsc, mainnet, polygon } from "viem/chains";

const execFileAsync = promisify(execFile);

function requestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.DATA_CONNECTOR_TIMEOUT_MS ?? 10000);
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

async function checkUrl(url: string, init?: RequestInit): Promise<{ reachable: boolean; degradedReason?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      return { reachable: false, degradedReason: `HTTP ${response.status} from ${url}` };
    }
    return { reachable: true };
  } catch (error) {
    return {
      reachable: false,
      degradedReason: error instanceof Error ? error.message : `Request failed for ${url}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getProviderStatuses(env: NodeJS.ProcessEnv): Promise<ProviderStatus[]> {
  const siliconflowConfigured = Boolean(env.SILICONFLOW_API_KEY);
  const coingeckoBaseUrl = coinGeckoBaseUrl(env);
  const coingeckoHeaders = coinGeckoHeaders(env);
  const defillama = await checkUrl(`${env.DEFILLAMA_BASE_URL ?? "https://api.llama.fi"}/protocols`, { method: "GET" });
  const dexscreener = await checkUrl(
    `${env.DEXSCREENER_BASE_URL ?? "https://api.dexscreener.com"}/token-pairs/v1/ethereum/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`,
    { method: "GET" }
  );
  const rpcConfigured = Boolean(env.ETHEREUM_RPC_URL || env.BASE_RPC_URL || env.ARBITRUM_RPC_URL || env.BSC_RPC_URL || env.POLYGON_RPC_URL);
  const rpcCheck = rpcConfigured ? await checkFirstRpc(env) : { reachable: false, degradedReason: "No EVM RPC URL is configured." };
  const coingecko = await checkCoinGeckoPublicApi(coingeckoBaseUrl, coingeckoHeaders);
  const siliconflow = siliconflowConfigured
    ? await checkUrl(`${env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1"}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${env.SILICONFLOW_API_KEY}` }
      })
    : { reachable: false, degradedReason: "SILICONFLOW_API_KEY is not configured." };
  const arkhamConfigured = Boolean(env.ARKHAM_API_KEY);
  const arkhamTemplatesConfigured = Boolean(
    env.ARKHAM_VERIFY_URL_TEMPLATE ||
      env.ARKHAM_ADDRESS_LABEL_URL_TEMPLATE ||
      env.ARKHAM_ADDRESS_TRANSFERS_URL_TEMPLATE ||
      env.ARKHAM_ADDRESS_HOLDINGS_URL_TEMPLATE
  );
  const arkham =
    arkhamConfigured && env.ARKHAM_VERIFY_URL_TEMPLATE
      ? await checkUrl(renderTemplate(env.ARKHAM_VERIFY_URL_TEMPLATE, { baseUrl: env.ARKHAM_BASE_URL ?? "" }), {
          method: "GET",
          headers: arkhamHeaders(env)
        })
      : {
          reachable: false,
          degradedReason: arkhamConfigured
            ? "ARKHAM_VERIFY_URL_TEMPLATE is not configured; fill it from your Arkham API docs to enable live verification."
            : "ARKHAM_API_KEY is not configured."
        };
  const holderConfigured = Boolean(
    env.HOLDER_CONCENTRATION_URL_TEMPLATE ||
      (env.HOLDER_CONCENTRATION_PROVIDER?.toLowerCase() === "etherscan" && env.ETHERSCAN_API_KEY)
  );

  return [
    {
      name: "siliconflow",
      configured: siliconflowConfigured,
      ...siliconflow
    },
    {
      name: "coingecko",
      configured: true,
      ...coingecko
    },
    {
      name: "defillama",
      configured: true,
      ...defillama
    },
    {
      name: "dexscreener",
      configured: true,
      ...dexscreener
    },
    {
      name: "arkham",
      configured: arkhamConfigured && arkhamTemplatesConfigured,
      ...arkham
    },
    {
      name: "evm-rpc",
      configured: rpcConfigured,
      ...rpcCheck
    },
    {
      name: "holder-concentration",
      configured: holderConfigured,
      reachable: holderConfigured,
      degradedReason: holderConfigured
        ? undefined
        : "Configure HOLDER_CONCENTRATION_URL_TEMPLATE or set HOLDER_CONCENTRATION_PROVIDER=etherscan with ETHERSCAN_API_KEY."
    }
  ];
}

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

export async function createEmbedding(text: string, env: NodeJS.ProcessEnv = process.env): Promise<{ embedding?: number[]; degradedReason?: string }> {
  if (!env.SILICONFLOW_API_KEY) {
    return { degradedReason: "SILICONFLOW_API_KEY is not configured, so embeddings were not generated." };
  }

  try {
    const baseUrl = env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
    const model = env.SILICONFLOW_EMBEDDING_MODEL ?? "BAAI/bge-m3";
    const response = await fetchJson<EmbeddingResponse>(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SILICONFLOW_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 8000)
      })
    });
    const embedding = response.data?.[0]?.embedding;
    return Array.isArray(embedding) ? { embedding } : { degradedReason: "Embedding provider returned no embedding vector." };
  } catch (error) {
    return { degradedReason: error instanceof Error ? error.message : "Embedding request failed." };
  }
}

function arkhamHeaders(env: NodeJS.ProcessEnv): HeadersInit {
  const key = env.ARKHAM_API_KEY;
  if (!key) return {};
  const headerName = env.ARKHAM_AUTH_HEADER_NAME || "API-Key";
  const scheme = env.ARKHAM_AUTH_SCHEME;
  return {
    [headerName]: scheme ? `${scheme} ${key}` : key
  };
}

function genericApiHeaders(prefix: string, env: NodeJS.ProcessEnv): HeadersInit {
  const key = env[`${prefix}_API_KEY`];
  if (!key) return {};
  const headerName = env[`${prefix}_AUTH_HEADER_NAME`] || "Authorization";
  const scheme = env[`${prefix}_AUTH_SCHEME`];
  return {
    [headerName]: scheme ? `${scheme} ${key}` : key
  };
}

function renderTemplate(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(values[key] ?? ""));
}

function matchesQueryValue(values: string[], queryValues: string[]): boolean {
  return queryValues.some((query) =>
    values.some((value) => value === query || (query.length >= 4 && value.includes(query)) || (value.length >= 4 && query.includes(value)))
  );
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "items", "results", "result", "transfers", "holdings", "labels", "holders"]) {
      const child = record[key];
      if (Array.isArray(child)) return asRecordArray(child);
    }
  }
  return [];
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringFromRecord(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function coinGeckoBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3").replace(/\/+$/, "");
}

function coinGeckoHeaders(env: NodeJS.ProcessEnv = process.env): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "sp-agent/0.1"
  };
  if (env.COINGECKO_API_KEY) {
    const headerName = env.COINGECKO_API_KEY_HEADER || (coinGeckoBaseUrl(env).includes("pro-api.coingecko.com") ? "x-cg-pro-api-key" : "x-cg-demo-api-key");
    headers[headerName] = env.COINGECKO_API_KEY;
  }
  return headers;
}

async function checkCoinGeckoPublicApi(baseUrl: string, headers: HeadersInit): Promise<{ reachable: boolean; degradedReason?: string }> {
  const url = `${baseUrl}/ping`;
  const checked = await checkUrl(url, {
    method: "GET",
    headers
  });
  if (checked.reachable) return checked;
  try {
    await fetchJsonWithCurl<unknown>(url, { headers });
    return { reachable: true };
  } catch {
    return checked;
  }
}

async function fetchCoinGeckoJson<T>(url: string, env: NodeJS.ProcessEnv): Promise<T> {
  const init: RequestInit = { headers: coinGeckoHeaders(env) };
  try {
    return await fetchJson<T>(url, init);
  } catch (error) {
    try {
      return await fetchJsonWithCurl<T>(url, init);
    } catch {
      throw error;
    }
  }
}

function numberFromRecord(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const parsed = numberFromUnknown(record[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function extractLabels(value: unknown): string[] {
  const records = asRecordArray(value);
  const labels = new Set<string>();
  for (const record of records) {
    for (const key of ["label", "name", "entity", "tag", "type"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) labels.add(value.trim());
    }
  }
  return Array.from(labels).slice(0, 20);
}

async function fetchOptionalArkhamTemplate(
  template: string | undefined,
  env: NodeJS.ProcessEnv,
  values: Record<string, string | undefined>
): Promise<{ url?: string; data?: unknown; degradedReason?: string }> {
  if (!template) return {};
  const url = renderTemplate(template, { ...values, baseUrl: env.ARKHAM_BASE_URL ?? "" });
  try {
    return {
      url,
      data: await fetchJson<unknown>(url, {
        headers: arkhamHeaders(env)
      })
    };
  } catch (error) {
    return {
      url,
      degradedReason: error instanceof Error ? error.message : `Arkham request failed for ${url}`
    };
  }
}

const erc20Abi = [
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }]
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }]
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }]
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  }
] as const;

const ownershipRiskAbi = [
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    name: "paused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }]
  }
] as const;

type ContractRiskCapability = keyof ContractRiskData["detectedCapabilities"];

const selectorSignatures: Array<{ selector: string; label: string; riskFlag: string; capability?: ContractRiskCapability }> = [
  { selector: "40c10f19", label: "mint(address,uint256)", riskFlag: "mint_function_present", capability: "mint" },
  { selector: "8456cb59", label: "pause()", riskFlag: "pause_function_present", capability: "pause" },
  { selector: "3f4ba83a", label: "unpause()", riskFlag: "unpause_function_present", capability: "pause" },
  { selector: "f2fde38b", label: "transferOwnership(address)", riskFlag: "ownership_transfer_present", capability: "ownerControl" },
  { selector: "715018a6", label: "renounceOwnership()", riskFlag: "renounce_ownership_present", capability: "ownerControl" },
  { selector: "3659cfe6", label: "upgradeTo(address)", riskFlag: "upgrade_function_present", capability: "upgrade" },
  { selector: "4f1ef286", label: "upgradeToAndCall(address,bytes)", riskFlag: "upgrade_function_present", capability: "upgrade" },
  { selector: "79ba5097", label: "acceptOwnership()", riskFlag: "ownership_transfer_present", capability: "ownerControl" },
  { selector: "a9059cbb", label: "transfer(address,uint256)", riskFlag: "erc20_transfer_present" },
  { selector: "23b872dd", label: "transferFrom(address,address,uint256)", riskFlag: "erc20_transfer_from_present" },
  { selector: "095ea7b3", label: "approve(address,uint256)", riskFlag: "erc20_approve_present" },
  { selector: "70a08231", label: "balanceOf(address)", riskFlag: "erc20_balance_present" },
  { selector: "8da5cb5b", label: "owner()", riskFlag: "owner_function_present", capability: "ownerControl" },
  { selector: "5c975abb", label: "paused()", riskFlag: "paused_function_present", capability: "pause" },
  { selector: "dd62ed3e", label: "allowance(address,address)", riskFlag: "erc20_allowance_present" },
  { selector: selectorFor("blacklist(address)"), label: "blacklist(address)", riskFlag: "blacklist_function_present", capability: "blacklist" },
  { selector: selectorFor("blacklist(address,bool)"), label: "blacklist(address,bool)", riskFlag: "blacklist_function_present", capability: "blacklist" },
  { selector: selectorFor("setBlacklist(address,bool)"), label: "setBlacklist(address,bool)", riskFlag: "blacklist_function_present", capability: "blacklist" },
  { selector: selectorFor("isBlacklisted(address)"), label: "isBlacklisted(address)", riskFlag: "blacklist_read_present", capability: "blacklist" },
  { selector: selectorFor("excludeFromFee(address)"), label: "excludeFromFee(address)", riskFlag: "fee_exclusion_function_present", capability: "taxOrFeeControl" },
  { selector: selectorFor("excludeFromFees(address,bool)"), label: "excludeFromFees(address,bool)", riskFlag: "fee_exclusion_function_present", capability: "taxOrFeeControl" },
  { selector: selectorFor("setFees(uint256,uint256)"), label: "setFees(uint256,uint256)", riskFlag: "tax_or_fee_control_present", capability: "taxOrFeeControl" },
  { selector: selectorFor("setTaxFeePercent(uint256)"), label: "setTaxFeePercent(uint256)", riskFlag: "tax_or_fee_control_present", capability: "taxOrFeeControl" },
  { selector: selectorFor("setBuyTax(uint256)"), label: "setBuyTax(uint256)", riskFlag: "tax_or_fee_control_present", capability: "taxOrFeeControl" },
  { selector: selectorFor("setSellTax(uint256)"), label: "setSellTax(uint256)", riskFlag: "tax_or_fee_control_present", capability: "taxOrFeeControl" },
  { selector: selectorFor("enableTrading()"), label: "enableTrading()", riskFlag: "trading_control_present", capability: "tradingControl" },
  { selector: selectorFor("openTrading()"), label: "openTrading()", riskFlag: "trading_control_present", capability: "tradingControl" },
  { selector: selectorFor("setTradingEnabled(bool)"), label: "setTradingEnabled(bool)", riskFlag: "trading_control_present", capability: "tradingControl" },
  { selector: selectorFor("uniswapV2Pair()"), label: "uniswapV2Pair()", riskFlag: "dex_pair_reference_present", capability: "dexPairControl" },
  { selector: selectorFor("automatedMarketMakerPairs(address)"), label: "automatedMarketMakerPairs(address)", riskFlag: "dex_pair_control_present", capability: "dexPairControl" },
  { selector: selectorFor("setAutomatedMarketMakerPair(address,bool)"), label: "setAutomatedMarketMakerPair(address,bool)", riskFlag: "dex_pair_control_present", capability: "dexPairControl" },
  { selector: selectorFor("setMaxTxAmount(uint256)"), label: "setMaxTxAmount(uint256)", riskFlag: "max_tx_or_wallet_control_present", capability: "maxTxOrWalletControl" },
  { selector: selectorFor("setMaxWalletSize(uint256)"), label: "setMaxWalletSize(uint256)", riskFlag: "max_tx_or_wallet_control_present", capability: "maxTxOrWalletControl" }
];

function selectorFor(signature: string): string {
  return toFunctionSelector(signature).replace(/^0x/, "");
}

function emptyContractCapabilities(): ContractRiskData["detectedCapabilities"] {
  return {
    mint: false,
    pause: false,
    upgrade: false,
    ownerControl: false,
    blacklist: false,
    taxOrFeeControl: false,
    tradingControl: false,
    dexPairControl: false,
    maxTxOrWalletControl: false
  };
}

function configuredChains(env: NodeJS.ProcessEnv) {
  return [
    { key: "ethereum", chain: mainnet, url: env.ETHEREUM_RPC_URL },
    { key: "base", chain: base, url: env.BASE_RPC_URL },
    { key: "arbitrum", chain: arbitrum, url: env.ARBITRUM_RPC_URL },
    { key: "bsc", chain: bsc, url: env.BSC_RPC_URL },
    { key: "polygon", chain: polygon, url: env.POLYGON_RPC_URL }
  ].filter((item): item is { key: string; chain: typeof mainnet; url: string } => Boolean(item.url));
}

async function checkFirstRpc(env: NodeJS.ProcessEnv): Promise<{ reachable: boolean; degradedReason?: string }> {
  const first = configuredChains(env)[0];
  if (!first) return { reachable: false, degradedReason: "No EVM RPC URL is configured." };
  try {
    const client = createPublicClient({ chain: first.chain, transport: http(first.url) });
    await client.getBlockNumber();
    return { reachable: true };
  } catch (error) {
    return { reachable: false, degradedReason: error instanceof Error ? error.message : "EVM RPC check failed." };
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(
  url: string
): Promise<{ statusCode: number; title?: string; snippet?: string; degradedReason?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "user-agent": "sp-agent/0.1"
      }
    });
    const statusCode = response.status;
    if (!response.ok) {
      return { statusCode, degradedReason: `HTTP ${response.status} from ${url}` };
    }

    const text = (await response.text()).slice(0, 250000);
    return {
      statusCode,
      title: extractHtmlTitle(text),
      snippet: extractHtmlSnippet(text)
    };
  } catch (error) {
    try {
      return await fetchTextWithCurl(url);
    } catch {
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithCurl(
  url: string,
  timeoutMs = requestTimeoutMs()
): Promise<{ statusCode: number; title?: string; snippet?: string; degradedReason?: string }> {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol for curl fallback: ${parsed.protocol}`);
  }
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const marker = "__SP_AGENT_STATUS__:";
  const { stdout } = await execFileAsync(
    "curl",
    ["-L", "-sS", "--max-time", String(timeoutSeconds), "-H", "accept: text/html,text/plain;q=0.9,*/*;q=0.5", "-H", "user-agent: sp-agent/0.1", "-w", `\\n${marker}%{http_code}`, url],
    { timeout: timeoutMs + 1000, maxBuffer: 2 * 1024 * 1024 }
  );
  const markerIndex = stdout.lastIndexOf(marker);
  const body = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
  const statusCode = markerIndex >= 0 ? Number(stdout.slice(markerIndex + marker.length).trim()) : 0;
  return {
    statusCode,
    title: extractHtmlTitle(body),
    snippet: extractHtmlSnippet(body),
    degradedReason: statusCode >= 400 ? `HTTP ${statusCode} from ${url}` : undefined
  };
}

async function fetchJsonWithRetry<T>(url: string, init?: RequestInit, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchJson<T>(url, init);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${url}`);
}

async function fetchJsonWithCurl<T>(url: string, init: RequestInit = {}, timeoutMs = requestTimeoutMs()): Promise<T> {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol for curl fallback: ${parsed.protocol}`);
  }
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const headerArgs = headersToCurlArgs(init.headers);
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "--fail", "--max-time", String(timeoutSeconds), "-H", "accept: application/json", "-H", "user-agent: sp-agent/0.1", ...headerArgs, url],
    { timeout: timeoutMs + 1000, maxBuffer: 5 * 1024 * 1024 }
  );
  return JSON.parse(stdout) as T;
}

function headersToCurlArgs(headers: HeadersInit | undefined): string[] {
  if (!headers) return [];
  const entries =
    headers instanceof Headers
      ? [...headers.entries()]
      : Array.isArray(headers)
        ? headers
        : Object.entries(headers);
  return entries.flatMap(([key, value]) => ["-H", `${key}: ${value}`]);
}

type CoinGeckoSearchResponse = {
  coins?: Array<{
    id: string;
    name: string;
    symbol: string;
    market_cap_rank?: number;
  }>;
};

type CoinGeckoMarketResponse = Array<{
  id: string;
  symbol: string;
  name: string;
  current_price?: number;
  market_cap?: number;
  fully_diluted_valuation?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
}>;

type DefiLlamaProtocol = {
  name?: string;
  slug?: string;
  symbol?: string;
  tvl?: number;
  url?: string;
  category?: string;
  chains?: string[];
  description?: string;
};

export async function searchProjectSources(
  asset: ResolvedAsset,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ sources: SourceCandidate[]; degradedReason?: string }> {
  const sources: SourceCandidate[] = [];
  const defillamaProtocolSource = await getDefiLlamaProtocolSource(asset, env);
  if (defillamaProtocolSource) sources.push(defillamaProtocolSource);
  if (asset.name) {
    sources.push({
      title: `${asset.name} DefiLlama`,
      url: `https://defillama.com/protocol/${encodeURIComponent(asset.name)}`,
      sourceType: "protocol",
      provider: "defillama"
    });
  }
  if (asset.symbol) {
    sources.push({
      title: `${asset.symbol} CoinGecko search`,
      url: `https://www.coingecko.com/en/search_redirect?${new URLSearchParams({ id: asset.symbol }).toString()}`,
      sourceType: "market",
      provider: "coingecko"
    });
  }
  if (asset.address) {
    sources.push({ title: `${asset.address} Etherscan`, url: `https://etherscan.io/token/${asset.address}`, sourceType: "explorer", provider: "etherscan" });
    const arkhamUrl = renderTemplate(env.ARKHAM_WEB_ADDRESS_URL_TEMPLATE ?? "https://platform.arkhamintelligence.com/explorer/address/{address}", {
      address: asset.address,
      chain: asset.chain
    });
    sources.push({ title: `${asset.address} Arkham`, url: arkhamUrl, sourceType: "onchain-intelligence", provider: "arkham" });
  }
  const hydratedSources = await Promise.all(sources.map((source) => hydrateSourceCandidate(source)));
  return {
    sources: hydratedSources,
    degradedReason: sources.length ? undefined : "No source candidates could be derived from the resolved asset."
  };
}

async function hydrateSourceCandidate(source: SourceCandidate): Promise<SourceCandidate> {
  if (source.fetchedAt && source.statusCode !== undefined && source.snippet) return source;
  const fetchedAt = new Date().toISOString();
  try {
    const fetched = await fetchText(source.url);
    return {
      ...source,
      title: fetched.title ?? source.title,
      fetchedAt,
      statusCode: fetched.statusCode,
      snippet: fetched.snippet,
      degradedReason: fetched.degradedReason
    };
  } catch (error) {
    return {
      ...source,
      fetchedAt,
      degradedReason: error instanceof Error ? error.message : `Source fetch failed for ${source.url}`
    };
  }
}

async function getDefiLlamaProtocolSource(asset: ResolvedAsset, env: NodeJS.ProcessEnv): Promise<SourceCandidate | undefined> {
  const queryValues = [asset.name, asset.symbol, asset.input].filter(Boolean).map((value) => value!.toLowerCase());
  if (!queryValues.length) return undefined;

  try {
    const fetchedAt = new Date().toISOString();
    const protocols = await fetchJson<DefiLlamaProtocol[]>(`${env.DEFILLAMA_BASE_URL ?? "https://api.llama.fi"}/protocols`);
    const match = protocols.find((protocol) => {
      const values = [protocol.name, protocol.slug, protocol.symbol].filter(Boolean).map((value) => value!.toLowerCase());
      return matchesQueryValue(values, queryValues);
    });
    if (!match) return undefined;

    const metadata = [
      match.category ? `category=${match.category}` : undefined,
      match.tvl === undefined ? undefined : `tvlUsd=${match.tvl}`,
      match.chains?.length ? `chains=${match.chains.slice(0, 8).join(", ")}` : undefined,
      match.description
    ]
      .filter(Boolean)
      .join("；");

    return {
      title: `${match.name ?? asset.input} DefiLlama protocol metadata`,
      url: `https://defillama.com/protocol/${encodeURIComponent(match.slug ?? match.name ?? asset.input)}`,
      sourceType: "protocol-api",
      provider: "defillama",
      fetchedAt,
      statusCode: 200,
      snippet: metadata || "DefiLlama protocol metadata matched this asset."
    };
  } catch {
    return undefined;
  }
}

function extractHtmlTitle(text: string): string | undefined {
  const metaTitle = text.match(/<meta\s+[^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1];
  const title = metaTitle ?? text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return normalizeText(title);
}

function extractHtmlSnippet(text: string): string | undefined {
  const description =
    text.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    text.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1];
  const visibleText = description ?? text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const normalized = normalizeText(visibleText);
  return normalized ? normalized.slice(0, 500) : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const decoded = value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const normalized = decoded.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

export async function getTokenMarketData(asset: ResolvedAsset, env: NodeJS.ProcessEnv = process.env): Promise<MarketData> {
  const fetchedAt = new Date().toISOString();

  try {
    const baseUrl = coinGeckoBaseUrl(env);
    let coinId = asset.symbol?.toLowerCase();

    if (asset.inputType === "symbol" || asset.inputType === "project_name") {
      const query = encodeURIComponent(asset.symbol ?? asset.name ?? asset.input);
      const search = await fetchCoinGeckoJson<CoinGeckoSearchResponse>(`${baseUrl}/search?query=${query}`, env);
      const firstCoin = search.coins?.sort((a, b) => (a.market_cap_rank ?? 999999) - (b.market_cap_rank ?? 999999))[0];
      if (firstCoin) coinId = firstCoin.id;
    }

    if (!coinId) {
      return { provider: "coingecko", fetchedAt, degradedReason: "CoinGecko coin id could not be resolved." };
    }

    const market = await fetchCoinGeckoJson<CoinGeckoMarketResponse>(
      `${baseUrl}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coinId)}&sparkline=false`,
      env
    );
    const coin = market[0];
    if (!coin) {
      return { provider: "coingecko", coingeckoId: coinId, fetchedAt, degradedReason: `CoinGecko returned no market row for ${coinId}.` };
    }

    return {
      provider: "coingecko",
      coingeckoId: coin.id,
      symbol: coin.symbol?.toUpperCase(),
      name: coin.name,
      priceUsd: coin.current_price,
      marketCapUsd: coin.market_cap,
      fdvUsd: coin.fully_diluted_valuation,
      volume24hUsd: coin.total_volume,
      change24hPct: coin.price_change_percentage_24h,
      sourceUrl: `https://www.coingecko.com/en/coins/${coin.id}`,
      fetchedAt
    };
  } catch (error) {
    return {
      provider: "coingecko",
      symbol: asset.symbol,
      fetchedAt,
      degradedReason: error instanceof Error ? error.message : "CoinGecko market data fetch failed."
    };
  }
}

export async function getMajorAssetMarketData(
  ids = ["bitcoin", "ethereum"],
  env: NodeJS.ProcessEnv = process.env
): Promise<{ assets: MarketData[]; degradedReason?: string }> {
  const fetchedAt = new Date().toISOString();

  try {
    const baseUrl = coinGeckoBaseUrl(env);
    const market = await fetchCoinGeckoJson<CoinGeckoMarketResponse>(
      `${baseUrl}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}&price_change_percentage=24h&sparkline=false`,
      env
    );

    return {
      assets: market.map((coin) => ({
        provider: "coingecko",
        coingeckoId: coin.id,
        symbol: coin.symbol?.toUpperCase(),
        name: coin.name,
        priceUsd: coin.current_price,
        marketCapUsd: coin.market_cap,
        fdvUsd: coin.fully_diluted_valuation,
        volume24hUsd: coin.total_volume,
        change24hPct: coin.price_change_percentage_24h,
        sourceUrl: `https://www.coingecko.com/en/coins/${coin.id}`,
        fetchedAt
      }))
    };
  } catch (error) {
    return {
      assets: ids.map((id) => ({ provider: "coingecko", coingeckoId: id, fetchedAt })),
      degradedReason: error instanceof Error ? error.message : "Major asset market data fetch failed."
    };
  }
}

export async function getDefiProtocolMetrics(asset: ResolvedAsset, env: NodeJS.ProcessEnv = process.env): Promise<MarketData> {
  const fetchedAt = new Date().toISOString();
  const baseUrl = env.DEFILLAMA_BASE_URL ?? "https://api.llama.fi";
  try {
    const protocols = await fetchJson<DefiLlamaProtocol[]>(`${baseUrl}/protocols`);
    const queryValues = [asset.name, asset.symbol, asset.input].filter(Boolean).map((value) => value!.toLowerCase());
    const match = protocols.find((protocol) => {
      const values = [protocol.name, protocol.slug, protocol.symbol].filter(Boolean).map((value) => value!.toLowerCase());
      return matchesQueryValue(values, queryValues);
    });

    if (!match) {
      return {
        provider: "defillama",
        symbol: asset.symbol,
        name: asset.name,
        fetchedAt,
        degradedReason: "DefiLlama reachable, but no protocol match was found for this asset."
      };
    }

    return {
      provider: "defillama",
      symbol: match.symbol,
      name: match.name,
      tvlUsd: match.tvl,
      sourceUrl: `https://defillama.com/protocol/${match.slug ?? match.name}`,
      fetchedAt
    };
  } catch (error) {
    return {
      provider: "defillama",
      symbol: asset.symbol,
      name: asset.name,
      fetchedAt,
      degradedReason: error instanceof Error ? error.message : "DefiLlama protocol metrics fetch failed."
    };
  }
}

export async function readErc20Metadata(asset: ResolvedAsset, env: NodeJS.ProcessEnv = process.env): Promise<OnchainData> {
  const fetchedAt = new Date().toISOString();
  if (!asset.address || !/^0x[a-fA-F0-9]{40}$/.test(asset.address)) {
    return {
      provider: "viem",
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      degradedReason: "Input is not an EVM contract address, so ERC20 metadata was not read."
    };
  }

  const chains = configuredChains(env);
  if (!chains.length) {
    return {
      provider: "viem",
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      degradedReason: "No EVM RPC URL is configured. Fill ETHEREUM_RPC_URL, BASE_RPC_URL, ARBITRUM_RPC_URL, BSC_RPC_URL, or POLYGON_RPC_URL in .env."
    };
  }

  const preferred = chains.find((item) => item.key === asset.chain) ?? chains[0];
  try {
    const client = createPublicClient({ chain: preferred.chain, transport: http(preferred.url) });
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      client.readContract({ address: asset.address as Address, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: asset.address as Address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: asset.address as Address, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: asset.address as Address, abi: erc20Abi, functionName: "totalSupply" })
    ]);

    return {
      provider: "viem",
      chain: preferred.key,
      address: asset.address,
      name,
      symbol,
      decimals,
      totalSupply: totalSupply.toString(),
      fetchedAt
    };
  } catch (error) {
    return {
      provider: "viem",
      chain: preferred.key,
      address: asset.address,
      fetchedAt,
      degradedReason: error instanceof Error ? error.message : "ERC20 metadata read failed."
    };
  }
}

export async function readContractRisk(asset: ResolvedAsset, env: NodeJS.ProcessEnv = process.env): Promise<ContractRiskData> {
  const fetchedAt = new Date().toISOString();
  if (!asset.address || !/^0x[a-fA-F0-9]{40}$/.test(asset.address)) {
    return {
      provider: "viem",
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      hasBytecode: false,
      isProxyLike: false,
      detectedSelectors: [],
      detectedCapabilities: emptyContractCapabilities(),
      riskFlags: [],
      degradedReason: "Input is not an EVM contract address, so contract risk checks were not run."
    };
  }

  const chains = configuredChains(env);
  if (!chains.length) {
    return {
      provider: "viem",
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      hasBytecode: false,
      isProxyLike: false,
      detectedSelectors: [],
      detectedCapabilities: emptyContractCapabilities(),
      riskFlags: [],
      degradedReason: "No EVM RPC URL is configured. Fill an EVM RPC URL in .env to enable bytecode/proxy/owner checks."
    };
  }

  const preferred = chains.find((item) => item.key === asset.chain) ?? chains[0];
  try {
    const client = createPublicClient({ chain: preferred.chain, transport: http(preferred.url) });
    const bytecode = await client.getCode({ address: asset.address as Address });
    const code = bytecode?.toLowerCase() ?? "0x";
    const hasBytecode = code.length > 2;
    const detectedSignatureRows = selectorSignatures.filter((item) => code.includes(item.selector));
    const detectedSelectors = detectedSignatureRows.map((item) => item.label);
    const detectedCapabilities = emptyContractCapabilities();
    for (const row of detectedSignatureRows) {
      if (row.capability) detectedCapabilities[row.capability] = true;
    }
    const riskFlags = new Set(detectedSignatureRows.map((item) => item.riskFlag));
    const isProxyLike =
      code.includes("360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc") ||
      code.includes("5c60da1b") ||
      code.includes("3659cfe6") ||
      code.includes("4f1ef286");

    if (isProxyLike) riskFlags.add("proxy_or_upgrade_pattern_present");
    if (isProxyLike) detectedCapabilities.upgrade = true;
    if (riskFlags.has("mint_function_present")) riskFlags.add("supply_can_potentially_expand");
    if (riskFlags.has("pause_function_present") || riskFlags.has("paused_function_present")) riskFlags.add("transfers_can_potentially_be_paused");
    if (riskFlags.has("owner_function_present")) riskFlags.add("owner_control_present");
    if (detectedCapabilities.blacklist) riskFlags.add("blacklist_or_freeze_capability_present");
    if (detectedCapabilities.taxOrFeeControl) riskFlags.add("tax_or_fee_can_potentially_change");
    if (detectedCapabilities.tradingControl) riskFlags.add("trading_can_potentially_be_gated");
    if (detectedCapabilities.dexPairControl) riskFlags.add("dex_pair_or_lp_routing_control_present");
    if (detectedCapabilities.maxTxOrWalletControl) riskFlags.add("max_tx_or_wallet_limit_control_present");

    let owner: string | undefined;
    let paused: boolean | undefined;
    try {
      owner = await client.readContract({ address: asset.address as Address, abi: ownershipRiskAbi, functionName: "owner" });
    } catch {
      owner = undefined;
    }
    try {
      paused = await client.readContract({ address: asset.address as Address, abi: ownershipRiskAbi, functionName: "paused" });
    } catch {
      paused = undefined;
    }
    if (owner && owner !== "0x0000000000000000000000000000000000000000") riskFlags.add("owner_not_zero");
    if (paused === true) riskFlags.add("contract_currently_paused");

    return {
      provider: "viem",
      chain: preferred.key,
      address: asset.address,
      fetchedAt,
      hasBytecode,
      isProxyLike,
      owner,
      paused,
      detectedSelectors,
      detectedCapabilities,
      riskFlags: Array.from(riskFlags)
    };
  } catch (error) {
    return {
      provider: "viem",
      chain: preferred.key,
      address: asset.address,
      fetchedAt,
      hasBytecode: false,
      isProxyLike: false,
      detectedSelectors: [],
      detectedCapabilities: emptyContractCapabilities(),
      riskFlags: [],
      degradedReason: error instanceof Error ? error.message : "Contract risk read failed."
    };
  }
}

function dexScreenerChainId(chain: string | undefined): string | undefined {
  if (!chain) return undefined;
  const normalized = chain.toLowerCase();
  const mapping: Record<string, string> = {
    ethereum: "ethereum",
    eth: "ethereum",
    base: "base",
    arbitrum: "arbitrum",
    bsc: "bsc",
    binance: "bsc",
    polygon: "polygon"
  };
  return mapping[normalized] ?? normalized;
}

function etherscanChainId(chain: string | undefined): string {
  const normalized = chain?.toLowerCase();
  const mapping: Record<string, string> = {
    ethereum: "1",
    eth: "1",
    mainnet: "1",
    base: "8453",
    arbitrum: "42161",
    bsc: "56",
    binance: "56",
    polygon: "137"
  };
  return normalized ? (mapping[normalized] ?? normalized) : "1";
}

type DexScreenerPairResponse = Array<{
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string | number | null;
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: Record<string, number>;
  liquidity?: { usd?: number; base?: number; quote?: number } | null;
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
}>;

function mapDexPair(pair: DexScreenerPairResponse[number]): DexPair {
  const txns24h = pair.txns?.h24 ? (pair.txns.h24.buys ?? 0) + (pair.txns.h24.sells ?? 0) : undefined;
  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    url: pair.url,
    pairAddress: pair.pairAddress,
    baseTokenSymbol: pair.baseToken?.symbol,
    quoteTokenSymbol: pair.quoteToken?.symbol,
    liquidityUsd: pair.liquidity?.usd,
    volume24hUsd: pair.volume?.h24,
    txns24h,
    priceUsd: numberFromUnknown(pair.priceUsd),
    fdvUsd: pair.fdv ?? undefined,
    marketCapUsd: pair.marketCap ?? undefined,
    pairCreatedAt: pair.pairCreatedAt ?? undefined
  };
}

export async function getDexLiquidityData(asset: ResolvedAsset, env: NodeJS.ProcessEnv = process.env): Promise<DexLiquidityData> {
  const fetchedAt = new Date().toISOString();
  if (!asset.address) {
    return {
      provider: "dexscreener",
      chain: asset.chain,
      fetchedAt,
      pairCount: 0,
      sourceUrls: [],
      pairs: [],
      degradedReason: "No token address was resolved, so DEX liquidity pools were not fetched."
    };
  }

  const chainId = dexScreenerChainId(asset.chain);
  if (!chainId) {
    return {
      provider: "dexscreener",
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      pairCount: 0,
      sourceUrls: [],
      pairs: [],
      degradedReason: "No DEX Screener chain id could be derived for this asset."
    };
  }

  const baseUrl = env.DEXSCREENER_BASE_URL ?? "https://api.dexscreener.com";
  const url = `${baseUrl}/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(asset.address)}`;
  try {
    let response: DexScreenerPairResponse;
    try {
      response = await fetchJsonWithRetry<DexScreenerPairResponse>(url);
    } catch {
      response = await fetchJsonWithCurl<DexScreenerPairResponse>(url);
    }
    const pairs = response.map(mapDexPair).sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)).slice(0, 10);
    const allMapped = response.map(mapDexPair);
    const totalLiquidityUsd = allMapped.reduce((sum, pair) => sum + (pair.liquidityUsd ?? 0), 0);
    const totalVolume24hUsd = allMapped.reduce((sum, pair) => sum + (pair.volume24hUsd ?? 0), 0);
    return {
      provider: "dexscreener",
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      pairCount: response.length,
      totalLiquidityUsd: totalLiquidityUsd || undefined,
      topPairLiquidityUsd: pairs[0]?.liquidityUsd,
      totalVolume24hUsd: totalVolume24hUsd || undefined,
      sourceUrls: pairs.map((pair) => pair.url).filter((item): item is string => Boolean(item)),
      pairs,
      degradedReason: response.length ? undefined : "DEX Screener returned no pools for this token."
    };
  } catch (error) {
    return {
      provider: "dexscreener",
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      pairCount: 0,
      sourceUrls: [url],
      pairs: [],
      degradedReason: error instanceof Error ? error.message : "DEX Screener liquidity fetch failed."
    };
  }
}

function extractHolderPercentage(record: Record<string, unknown>): number | undefined {
  const raw = numberFromRecord(record, ["pct", "percentage", "percent", "share", "ownerPercentage", "token_share"]);
  if (raw === undefined) return undefined;
  return raw > 1 && raw <= 100 ? raw : raw <= 1 ? raw * 100 : raw;
}

function resolveHolderConcentrationRequest(
  asset: ResolvedAsset,
  env: NodeJS.ProcessEnv
): { provider: string; url?: string; headers?: HeadersInit; degradedReason?: string } {
  const provider = (env.HOLDER_CONCENTRATION_PROVIDER || "template").toLowerCase();
  if (env.HOLDER_CONCENTRATION_URL_TEMPLATE) {
    return {
      provider,
      url: renderTemplate(env.HOLDER_CONCENTRATION_URL_TEMPLATE, {
        address: asset.address,
        chain: asset.chain,
        chainId: etherscanChainId(asset.chain),
        apiKey: env.HOLDER_CONCENTRATION_API_KEY
      }),
      headers: genericApiHeaders("HOLDER_CONCENTRATION", env)
    };
  }

  if (provider === "etherscan") {
    if (!env.ETHERSCAN_API_KEY) {
      return {
        provider,
        degradedReason: "ETHERSCAN_API_KEY is not configured. Etherscan holder APIs are PRO/Standard endpoints and require an API key."
      };
    }
    const url = new URL(env.ETHERSCAN_BASE_URL ?? "https://api.etherscan.io/v2/api");
    url.searchParams.set("chainid", etherscanChainId(asset.chain));
    url.searchParams.set("module", "token");
    url.searchParams.set("action", env.ETHERSCAN_HOLDER_ACTION || "topholders");
    url.searchParams.set("contractaddress", asset.address ?? "");
    url.searchParams.set("offset", env.ETHERSCAN_HOLDER_OFFSET || "100");
    url.searchParams.set("apikey", env.ETHERSCAN_API_KEY);
    return { provider, url: url.toString() };
  }

  return {
    provider,
    degradedReason:
      "HOLDER_CONCENTRATION_URL_TEMPLATE is not configured. Set HOLDER_CONCENTRATION_PROVIDER=etherscan with ETHERSCAN_API_KEY, or fill a holder API URL template."
  };
}

export async function getHolderConcentrationData(asset: ResolvedAsset, env: NodeJS.ProcessEnv = process.env): Promise<HolderConcentrationData> {
  const fetchedAt = new Date().toISOString();
  const request = resolveHolderConcentrationRequest(asset, env);
  const provider = request.provider;
  if (!asset.address) {
    return {
      provider,
      chain: asset.chain,
      fetchedAt,
      holderCount: 0,
      topHolders: [],
      degradedReason: "No token address was resolved, so holder concentration was not fetched."
    };
  }

  if (!request.url) {
    return {
      provider,
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      holderCount: 0,
      topHolders: [],
      degradedReason: request.degradedReason
    };
  }

  const url = request.url;
  try {
    const data = await fetchJson<unknown>(url, {
      headers: request.headers
    });
    const records = asRecordArray(data);
    const topHolders = records
      .map((record) => ({
        address: stringFromRecord(record, ["address", "holder", "holderAddress", "owner", "account", "TokenHolderAddress"]),
        balance: stringFromRecord(record, ["balance", "tokenBalance", "amount", "value", "TokenHolderQuantity"]),
        pct: extractHolderPercentage(record)
      }))
      .filter((holder) => holder.address || holder.balance || holder.pct !== undefined)
      .slice(0, 20);
    const top10Pct = topHolders.slice(0, 10).reduce((sum, holder) => sum + (holder.pct ?? 0), 0) || undefined;
    const top20Pct = topHolders.slice(0, 20).reduce((sum, holder) => sum + (holder.pct ?? 0), 0) || undefined;
    return {
      provider,
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      holderCount: records.length,
      top10Pct,
      top20Pct,
      topHolders,
      sourceUrl: url,
      degradedReason: topHolders.length ? undefined : "Holder provider returned no parseable holder rows."
    };
  } catch (error) {
    return {
      provider,
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      holderCount: 0,
      topHolders: [],
      sourceUrl: url,
      degradedReason: error instanceof Error ? error.message : "Holder concentration fetch failed."
    };
  }
}

export async function getArkhamAddressIntel(asset: ResolvedAsset, env: NodeJS.ProcessEnv = process.env): Promise<ArkhamIntel> {
  const fetchedAt = new Date().toISOString();
  if (!asset.address) {
    return {
      provider: "arkham",
      chain: asset.chain,
      fetchedAt,
      labelCount: 0,
      transferCount: 0,
      holdingCount: 0,
      labels: [],
      transferSample: [],
      holdingSample: [],
      sourceUrls: [],
      degradedReason: "No address was resolved, so Arkham address intelligence was not fetched."
    };
  }

  if (!env.ARKHAM_API_KEY) {
    return {
      provider: "arkham",
      chain: asset.chain,
      address: asset.address,
      fetchedAt,
      labelCount: 0,
      transferCount: 0,
      holdingCount: 0,
      labels: [],
      transferSample: [],
      holdingSample: [],
      sourceUrls: [],
      degradedReason: "ARKHAM_API_KEY is not configured."
    };
  }

  const values = { address: asset.address, chain: asset.chain };
  const [labelsResponse, transfersResponse, holdingsResponse] = await Promise.all([
    fetchOptionalArkhamTemplate(env.ARKHAM_ADDRESS_LABEL_URL_TEMPLATE, env, values),
    fetchOptionalArkhamTemplate(env.ARKHAM_ADDRESS_TRANSFERS_URL_TEMPLATE, env, values),
    fetchOptionalArkhamTemplate(env.ARKHAM_ADDRESS_HOLDINGS_URL_TEMPLATE, env, values)
  ]);

  const configuredCount = [env.ARKHAM_ADDRESS_LABEL_URL_TEMPLATE, env.ARKHAM_ADDRESS_TRANSFERS_URL_TEMPLATE, env.ARKHAM_ADDRESS_HOLDINGS_URL_TEMPLATE].filter(Boolean).length;
  const degradedReasons = [labelsResponse.degradedReason, transfersResponse.degradedReason, holdingsResponse.degradedReason].filter((reason): reason is string =>
    Boolean(reason)
  );

  if (!configuredCount) {
    degradedReasons.push("No Arkham address URL templates are configured. Fill ARKHAM_ADDRESS_LABEL_URL_TEMPLATE, ARKHAM_ADDRESS_TRANSFERS_URL_TEMPLATE, or ARKHAM_ADDRESS_HOLDINGS_URL_TEMPLATE from your Arkham API docs.");
  }

  const labels = extractLabels(labelsResponse.data);
  const transfers = asRecordArray(transfersResponse.data).slice(0, 5);
  const holdings = asRecordArray(holdingsResponse.data).slice(0, 10);
  const urls = [labelsResponse.url, transfersResponse.url, holdingsResponse.url].filter((url): url is string => Boolean(url));

  return {
    provider: "arkham",
    chain: asset.chain,
    address: asset.address,
    fetchedAt,
    labelCount: labels.length,
    transferCount: asRecordArray(transfersResponse.data).length,
    holdingCount: asRecordArray(holdingsResponse.data).length,
    labels,
    transferSample: transfers,
    holdingSample: holdings,
    sourceUrls: urls,
    degradedReason: degradedReasons.length ? degradedReasons.join(" | ") : undefined
  };
}
