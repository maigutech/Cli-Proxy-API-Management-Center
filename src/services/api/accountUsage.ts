import { apiClient } from './client';

export interface UsageTotals {
  requests: number;
  failed: number;
  tokens: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  priced: number;
  unpriced: number;
  cost: number;
}
export interface UsageStatus {
  ready: boolean;
  captureSince: string;
  completeSince: string;
  retentionDays: number;
  pending: number;
  dropped: number;
  error: string;
}
export interface UsageQuota {
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string;
  observedAt: string;
  windowStart: string;
  stale: boolean;
  windowUsage: UsageTotals;
  estimatedTotal: number | null;
  estimatedRemaining: number | null;
  estimateReason: string;
}
export interface AccountUsage {
  today: UsageTotals;
  sevenDays: UsageTotals;
  trackingSince: string;
  exclusive: boolean;
  quota: UsageQuota | null;
}
export interface ModelPriceRates {
  input: number;
  output: number;
  cacheRead: number | null;
  cacheWrite: number | null;
  cacheWrite30m: number | null;
  cacheWrite12h: number | null;
}
export interface ModelPrice {
  version: number;
  provider: string;
  model: string;
  tier: string;
  rates: ModelPriceRates;
  longContextThreshold: number;
  longContext: ModelPriceRates | null;
  source: string;
  sourceUrl: string;
  effectiveAt: string;
}
export interface PriceSyncStatus {
  enabled: boolean;
  running: boolean;
  intervalMinutes: number;
  sourceUrl: string;
  lastChecked: string;
  lastSuccess: string;
  lastUpdated: string;
  error: string;
  updatedRows: number;
  skippedRows: number;
  catalogRows: number;
}
export function normalizePriceSyncStatus(raw: unknown): PriceSyncStatus {
  const d = object(raw);
  if (typeof d.enabled !== 'boolean' || typeof d.running !== 'boolean')
    throw new Error('Invalid price sync status');
  return {
    enabled: d.enabled,
    running: d.running,
    intervalMinutes: number(d.interval_minutes),
    sourceUrl: string(d.source_url),
    lastChecked: string(d.last_checked),
    lastSuccess: string(d.last_success),
    lastUpdated: string(d.last_updated),
    error: string(d.error),
    updatedRows: number(d.updated_rows),
    skippedRows: number(d.skipped_rows),
    catalogRows: number(d.catalog_rows),
  };
}
export interface UsageRecord {
  sequence: number;
  executionId: string;
  traceId: string;
  requestedAt: string;
  completedAt: string;
  authIndex: string;
  provider: string;
  statusCode: number | null;
  ttftMs: number | null;
  requestedModel: string;
  upstreamModel: string;
  responseModel: string;
  pricingModel: string;
  serviceTier: string;
  source: string;
  transport: string;
  stream: boolean;
  failed: boolean;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  price: ModelPrice | null;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  } | null;
  costStatus: string;
  longContext: boolean;
}
export interface UsageDetails {
  status: UsageStatus;
  summary: UsageTotals;
  models: Array<UsageTotals & { provider: string; model: string }>;
  records: UsageRecord[];
  nextCursor: number;
}
export interface UsageAccounts {
  status: UsageStatus;
  accounts: Record<string, AccountUsage>;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid usage response');
  return value as Record<string, unknown>;
};
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('Invalid usage number');
  return value;
};
const string = (value: unknown): string => (typeof value === 'string' ? value : '');
const nullable = (value: unknown): number | null => (value == null ? null : number(value));
export function normalizeUsageTotals(raw: unknown): UsageTotals {
  const d = object(raw);
  return {
    requests: number(d.requests),
    failed: number(d.failed),
    tokens: number(d.tokens),
    input: number(d.input_tokens),
    output: number(d.output_tokens),
    cacheRead: number(d.cache_read_tokens),
    cacheWrite: number(d.cache_write_tokens),
    reasoning: number(d.reasoning_tokens),
    priced: number(d.priced_requests),
    unpriced: number(d.unpriced_requests),
    cost: number(d.cost),
  };
}
export function normalizeUsageStatus(raw: unknown): UsageStatus {
  const d = object(raw);
  return {
    ready: d.ready === true,
    captureSince: string(d.capture_since),
    completeSince: string(d.complete_since),
    retentionDays: number(d.retention_days),
    pending: number(d.pending),
    dropped: number(d.dropped),
    error: string(d.error),
  };
}
export function normalizeModelPriceRates(raw: unknown): ModelPriceRates {
  const d = object(raw);
  return {
    input: number(d.input),
    output: number(d.output),
    cacheRead: nullable(d.cache_read),
    cacheWrite: nullable(d.cache_write),
    cacheWrite30m: nullable(d.cache_write_30m),
    cacheWrite12h: nullable(d.cache_write_12h),
  };
}
export function normalizeModelPrice(raw: unknown): ModelPrice {
  const d = object(raw);
  return {
    version: number(d.version),
    provider: string(d.provider),
    model: string(d.model),
    tier: string(d.tier),
    rates: normalizeModelPriceRates(d.rates),
    longContextThreshold: number(d.long_context_threshold),
    longContext: d.long_context == null ? null : normalizeModelPriceRates(d.long_context),
    source: string(d.source),
    sourceUrl: string(d.source_url),
    effectiveAt: string(d.effective_at),
  };
}
export function serializeModelPrice(p: ModelPrice) {
  const rates = (r: ModelPriceRates) => ({
    input: r.input,
    output: r.output,
    cache_read: r.cacheRead,
    cache_write: r.cacheWrite,
    cache_write_30m: r.cacheWrite30m,
    cache_write_12h: r.cacheWrite12h,
  });
  return {
    version: p.version,
    provider: p.provider,
    model: p.model,
    tier: p.tier,
    rates: rates(p.rates),
    long_context_threshold: p.longContextThreshold,
    long_context: p.longContext && rates(p.longContext),
  };
}
function normalizeQuota(raw: unknown): UsageQuota {
  const d = object(raw);
  return {
    usedPercent: number(d.used_percent),
    remainingPercent: number(d.remaining_percent),
    resetsAt: string(d.resets_at),
    observedAt: string(d.observed_at),
    windowStart: string(d.window_start),
    stale: d.stale === true,
    windowUsage: normalizeUsageTotals(d.window_usage),
    estimatedTotal: nullable(d.estimated_total),
    estimatedRemaining: nullable(d.estimated_remaining),
    estimateReason: string(d.estimate_reason),
  };
}
export function normalizeUsageAccounts(raw: unknown): UsageAccounts {
  const d = object(raw);
  const accounts = Object.fromEntries(
    Object.entries(object(d.accounts)).map(([key, rawAccount]) => {
      const a = object(rawAccount);
      return [
        key,
        {
          today: normalizeUsageTotals(a.today),
          sevenDays: normalizeUsageTotals(a.seven_days),
          trackingSince: string(a.tracking_since),
          exclusive: a.exclusive === true,
          quota: a.quota == null ? null : normalizeQuota(a.quota),
        },
      ];
    })
  );
  return { status: normalizeUsageStatus(d.status), accounts };
}
export function normalizeUsageRecord(raw: unknown): UsageRecord {
  const r = object(raw);
  const tokens = object(r.tokens);
  const input = object(tokens.input);
  const output = object(tokens.output);
  const cost = r.cost == null ? null : object(r.cost);
  return {
    sequence: number(r.sequence),
    executionId: string(r.execution_id),
    traceId: string(r.trace_id),
    requestedAt: string(r.requested_at),
    completedAt: string(r.completed_at),
    authIndex: string(r.auth_index),
    provider: string(r.provider),
    statusCode: r.status_code == null || r.status_code === 0 ? null : number(r.status_code),
    ttftMs: nullable(r.ttft_ms),
    requestedModel: string(r.requested_model),
    upstreamModel: string(r.upstream_model),
    responseModel: string(r.response_model),
    pricingModel: string(r.pricing_model),
    serviceTier: string(r.service_tier),
    source: string(r.source),
    transport: string(r.transport),
    stream: r.stream === true,
    failed: r.failed === true,
    input: number(input.uncached_tokens),
    cacheRead: number(input.cache_read_tokens),
    cacheWrite: number(input.cache_write_tokens),
    output: number(output.total_tokens),
    reasoning: number(output.reasoning_tokens),
    price: r.price == null ? null : normalizeModelPrice(r.price),
    costStatus: string(r.cost_status),
    longContext: r.long_context === true,
    cost: cost && {
      input: number(cost.input),
      output: number(cost.output),
      cacheRead: number(cost.cache_read),
      cacheWrite: number(cost.cache_write),
      total: number(cost.total),
    },
  };
}
export function normalizeUsageDetails(raw: unknown): UsageDetails {
  const d = object(raw);
  if (!Array.isArray(d.models) || !Array.isArray(d.records))
    throw new Error('Invalid usage records');
  return {
    status: normalizeUsageStatus(d.status),
    summary: normalizeUsageTotals(d.summary),
    models: d.models.map((raw) => {
      const m = object(raw);
      return { ...normalizeUsageTotals(m), provider: string(m.provider), model: string(m.model) };
    }),
    records: d.records.map(normalizeUsageRecord),
    nextCursor: number(d.next_cursor),
  };
}
export function captureUsageApi() {
  const revision = apiClient.getConnectionRevision();
  const client = apiClient.captureConnection();
  const current = () => apiClient.getConnectionRevision() === revision;
  const check = () => {
    if (!current()) throw new Error('Connection changed');
  };
  return {
    isCurrent: current,
    accounts: async (indices: string[], signal?: AbortSignal) => {
      check();
      return normalizeUsageAccounts(
        await client.get('/observability/usage/accounts', {
          params: {
            auth_indices: indices.join(','),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          signal,
        })
      );
    },
    details: async (
      params: {
        authIndex: string;
        from: string;
        to: string;
        model?: string;
        source?: string;
        before?: number;
      },
      signal?: AbortSignal
    ) => {
      check();
      return normalizeUsageDetails(
        await client.get('/observability/usage/records', {
          params: {
            auth_index: params.authIndex,
            from: params.from,
            to: params.to,
            model: params.model,
            source: params.source,
            before: params.before,
          },
          signal,
        })
      );
    },
    prices: async (signal?: AbortSignal) => {
      check();
      const d = object(await client.get('/observability/usage/prices', { signal }));
      if (!Array.isArray(d.prices)) throw new Error('Invalid price catalog');
      return { prices: d.prices.map(normalizeModelPrice), status: normalizeUsageStatus(d.status) };
    },
    priceSyncStatus: async (signal?: AbortSignal) => {
      check();
      return normalizePriceSyncStatus(
        await client.get('/observability/usage/prices/sync', { signal })
      );
    },
    syncPrices: async () => {
      check();
      return normalizePriceSyncStatus(await client.post('/observability/usage/prices/sync'));
    },
    setPriceSyncEnabled: async (enabled: boolean) => {
      check();
      return normalizePriceSyncStatus(
        await client.put('/observability/usage/prices/sync', { enabled })
      );
    },
    savePrice: async (price: ModelPrice) => {
      check();
      return normalizeModelPrice(
        await client.put('/observability/usage/prices', serializeModelPrice(price))
      );
    },
    retention: async (days: number) => {
      check();
      return normalizeUsageStatus(
        await client.put('/observability/usage/settings', { retention_days: days })
      );
    },
    exclusive: async (index: string, value: boolean) => {
      check();
      await client.put('/observability/usage/accounts/settings', {
        auth_index: index,
        exclusive: value,
      });
    },
    refreshQuota: async (name: string, index: string) => {
      check();
      return client.post<unknown>('/credentials/usage/quota', { name, auth_index: index });
    },
  };
}
