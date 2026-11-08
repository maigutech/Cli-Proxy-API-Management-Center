import type { UsageTotals } from '@/services/api/accountUsage';

export function money(value: number | null | undefined): string {
  return value == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }).format(value);
}
export function totalMoney(value?: UsageTotals): string {
  return !value || (value.requests > 0 && value.priced === 0) ? '—' : money(value.cost);
}
export function dateLabel(value?: string): string {
  if (!value || value.startsWith('0001-')) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
export function usageRange(mode: string, from: string, to: string, now = new Date()) {
  const end = new Date(now);
  let start = new Date(now);
  if (mode === 'today') start.setHours(0, 0, 0, 0);
  else if (mode === 'custom') {
    start = new Date(from);
    const customEnd = new Date(to);
    if (
      !from ||
      !to ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(customEnd.getTime()) ||
      customEnd <= start
    )
      return null;
    return { from: start.toISOString(), to: customEnd.toISOString() };
  } else start = new Date(end.getTime() - 7 * 86400000);
  return { from: start.toISOString(), to: end.toISOString() };
}
export function sumUsage(values: UsageTotals[]): {
  cost: number;
  unpriced: number;
  priced: number;
  requests: number;
} {
  return values.reduce(
    (a, b) => ({
      cost: a.cost + b.cost,
      unpriced: a.unpriced + b.unpriced,
      priced: a.priced + b.priced,
      requests: a.requests + b.requests,
    }),
    { cost: 0, unpriced: 0, priced: 0, requests: 0 }
  );
}
