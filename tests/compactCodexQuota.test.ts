import { expect, test } from 'bun:test';
import { compactCodexWindows } from '../src/features/authFiles/components/codexQuotaSummary';
import type { UsageQuota } from '../src/services/api/accountUsage';
const now = Date.parse('2026-11-08T12:00:00Z');
const weekly = { usedPercent: 32, stale: false, resetsAt: '2026-11-09T12:00:00Z' } as UsageQuota;
test('unknown quotas remain unknown; review and monthly windows are not weekly', () => {
  expect(compactCodexWindows(undefined, undefined, now).map((w) => w.usedPercent)).toEqual([
    null,
    null,
  ]);
  const windows = compactCodexWindows(
    {
      status: 'success',
      windows: [
        { id: 'monthly', label: '30d', usedPercent: 20, resetLabel: '' },
        { id: 'code-review-weekly', label: 'Review', usedPercent: 99, resetLabel: '' },
      ],
    },
    undefined,
    now
  );
  expect(windows.map((w) => w.id)).toEqual(['monthly']);
});
test('persistent weekly observations survive idle/loading/error and expire honestly', () => {
  for (const status of ['idle', 'loading', 'error'] as const) {
    expect(compactCodexWindows({ status, windows: [] }, weekly, now)[0].usedPercent).toBe(32);
  }
  expect(compactCodexWindows(undefined, { ...weekly, stale: true }, now)[0].usedPercent).toBeNull();
  expect(compactCodexWindows(undefined, weekly, now + 2 * 86400000)[0].usedPercent).toBeNull();
});
test('fresh persisted quota updates cached bars without mutating shared windows', () => {
  const window = {
    id: 'weekly',
    label: '7d',
    usedPercent: 0,
    resetAtMs: now + 1000,
    resetLabel: '',
  };
  const quota = { status: 'success' as const, windows: [window] };
  expect(compactCodexWindows(quota, weekly, now)[0].usedPercent).toBe(32);
  expect(compactCodexWindows(quota, undefined, now + 2000)[0].usedPercent).toBeNull();
  expect(window.usedPercent).toBe(0);
});
