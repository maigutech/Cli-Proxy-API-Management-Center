import { apiClient } from './client';
import {
  normalizeUsageRecord,
  normalizeUsageStatus,
  normalizeUsageTotals,
  type UsageRecord,
  type UsageStatus,
  type UsageTotals,
} from './accountUsage';

export interface RequestLogQuery {
  from: string;
  to: string;
  authIndex?: string;
  model?: string;
  source?: string;
  result?: string;
  transport?: string;
  stream?: boolean;
  statusCode?: number;
  requestId?: string;
  page: number;
  pageSize: number;
  snapshot?: number;
}
export interface RequestLogsResult {
  status: UsageStatus;
  summary: UsageTotals;
  records: UsageRecord[];
  accounts: Array<{ authIndex: string; name: string }>;
  models: string[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  snapshot: number;
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid request logs');
  return v as Record<string, unknown>;
};
const integer = (v: unknown, min = 0): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min)
    throw new Error('Invalid request log pagination');
  return v;
};
export function normalizeRequestLogs(raw: unknown): RequestLogsResult {
  const d = object(raw);
  if (!Array.isArray(d.records) || !Array.isArray(d.accounts) || !Array.isArray(d.models))
    throw new Error('Invalid request log records');
  return {
    status: normalizeUsageStatus(d.status),
    summary: normalizeUsageTotals(d.summary),
    records: d.records.map(normalizeUsageRecord),
    accounts: d.accounts.map((raw) => {
      const a = object(raw);
      if (typeof a.auth_index !== 'string' || typeof a.name !== 'string')
        throw new Error('Invalid request log account');
      return { authIndex: a.auth_index, name: a.name };
    }),
    models: d.models.map((m) => {
      if (typeof m !== 'string') throw new Error('Invalid request log model');
      return m;
    }),
    total: integer(d.total),
    page: integer(d.page, 1),
    pageSize: integer(d.page_size, 1),
    totalPages: integer(d.total_pages, 1),
    snapshot: integer(d.snapshot),
  };
}
export function requestLogParams(q: RequestLogQuery) {
  return {
    from: q.from,
    to: q.to,
    page: q.page,
    page_size: q.pageSize,
    snapshot: q.snapshot,
    auth_index: q.authIndex || undefined,
    model: q.model || undefined,
    source: q.source || undefined,
    result: q.result || undefined,
    transport: q.transport || undefined,
    stream: q.stream,
    status_code: q.statusCode,
    request_id: q.requestId?.trim() || undefined,
  };
}
export function captureRequestLogsApi() {
  const revision = apiClient.getConnectionRevision();
  const client = apiClient.captureConnection();
  const isCurrent = () => apiClient.getConnectionRevision() === revision;
  return {
    revision,
    isCurrent,
    list: async (query: RequestLogQuery, signal?: AbortSignal) => {
      if (!isCurrent()) throw new Error('Connection changed');
      const raw = await client.get('/observability/request-logs', {
        params: requestLogParams(query),
        signal,
      });
      if (!isCurrent()) throw new Error('Connection changed');
      return normalizeRequestLogs(raw);
    },
  };
}
