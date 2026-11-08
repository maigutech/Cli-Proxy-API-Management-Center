import type { CodexQuotaState, CodexQuotaWindow } from '@/types';
import type { UsageQuota } from '@/services/api/accountUsage';

// Only the account's own windows belong in the summary; review quotas stay in details.
export function compactCodexWindows(
  quota: CodexQuotaState | undefined,
  weekly: UsageQuota | null | undefined,
  now: number
): CodexQuotaWindow[] {
  const windows = (quota?.windows ?? []).filter((w) => !w.id.startsWith('code-review'));
  const result = windows.map((w) => ({ ...w }));
  const weeklyIndex = result.findIndex((w) => w.id === 'weekly');
  // Request headers can update the persisted observation between manual quota refreshes.
  if (weekly && (!weekly.stale || quota?.status !== 'success' || weeklyIndex < 0)) {
    const fallback = {
      id: 'weekly',
      label: '7d',
      usedPercent: weekly.stale ? null : weekly.usedPercent,
      resetLabel: '',
      resetAtMs: Date.parse(weekly.resetsAt),
    };
    if (weeklyIndex >= 0) result[weeklyIndex] = fallback;
    else result.push(fallback);
  }
  if (result.length === 0)
    result.push(
      { id: 'five-hour', label: '5h', usedPercent: null, resetLabel: '' },
      { id: 'weekly', label: '7d', usedPercent: null, resetLabel: '' }
    );
  return result.map((w) => ({
    ...w,
    usedPercent: w.resetAtMs != null && w.resetAtMs <= now ? null : w.usedPercent,
  }));
}
