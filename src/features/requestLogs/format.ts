import type { RequestLogQuery } from '@/services/api/requestLogs';
import type { UsageRecord } from '@/services/api/accountUsage';
import { UNASSIGNED_GROUP } from '@/features/serviceGroups/membership';

export interface LogFilters {
  groupId: string;
  range: string;
  from: string;
  to: string;
  authIndex: string;
  model: string;
  result: string;
  source: string;
  transport: string;
  stream: string;
  statusCode: string;
  requestId: string;
}
export const defaultFilters: LogFilters = {
  groupId: '',
  range: 'day',
  from: '',
  to: '',
  authIndex: '',
  model: '',
  result: '',
  source: '',
  transport: '',
  stream: '',
  statusCode: '',
  requestId: '',
};
export function buildLogQuery(
  f: LogFilters,
  pageSize = 25,
  now = new Date()
): RequestLogQuery | null {
  let end = new Date(now);
  let start = new Date(end.getTime() - (f.range === 'week' ? 7 : 1) * 86400000);
  if (f.range === 'today') {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
  }
  if (f.range === 'custom') {
    start = new Date(f.from);
    end = new Date(f.to);
  }
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    end.getTime() - start.getTime() > 3651 * 86400000
  )
    return null;
  const statusCode = f.statusCode ? Number(f.statusCode) : undefined;
  if (
    statusCode !== undefined &&
    (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)
  )
    return null;
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    page: 1,
    pageSize,
    groupId: f.groupId === UNASSIGNED_GROUP ? undefined : f.groupId,
    groupUnassigned: f.groupId === UNASSIGNED_GROUP ? true : undefined,
    authIndex: f.authIndex,
    model: f.model,
    source: f.source,
    result: f.result,
    transport: f.transport,
    stream: f.stream ? f.stream === 'true' : undefined,
    statusCode,
    requestId: f.requestId.trim(),
  };
}
export function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}
export function duration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}
export function latency(row: UsageRecord): number | null {
  if (!row.requestedAt || !row.completedAt) return null;
  const value = Date.parse(row.completedAt) - Date.parse(row.requestedAt);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function pageQuery(q: RequestLogQuery, page: number, snapshot: number): RequestLogQuery {
  return { ...q, page, snapshot };
}

export function logTimestamp(value: string): string {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime()) || value.startsWith('0001-')) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
