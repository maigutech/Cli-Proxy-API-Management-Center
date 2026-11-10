import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  normalizeWeeklyQuotaProtection,
  normalizeUsageAccounts,
} from '../src/services/api/accountUsage';
import {
  compactCodexWindows,
  weeklyQuotaProtectionActive,
} from '../src/features/authFiles/components/codexQuotaSummary';
import type { UsageQuota } from '../src/services/api/accountUsage';

const zero = Object.fromEntries(
  [
    'requests',
    'failed',
    'tokens',
    'input_tokens',
    'output_tokens',
    'cache_read_tokens',
    'cache_write_tokens',
    'reasoning_tokens',
    'priced_requests',
    'unpriced_requests',
    'cost',
  ].map((key) => [key, 0])
);
const now = Date.parse('2026-11-10T12:00:00Z');
const reset = '2026-11-11T12:00:00Z';
const wire = { threshold_percent: 90, paused: true, used_percent: 90.5, resets_at: reset };
const protection = normalizeWeeklyQuotaProtection(wire)!;

test('accepts valid protection and rejects malformed limits or unbounded holds', () => {
  expect(protection).toMatchObject({
    thresholdPercent: 90,
    paused: true,
    usedPercent: 90.5,
    resetsAt: reset,
  });
  expect(normalizeWeeklyQuotaProtection({ threshold_percent: 90, paused: false })).toMatchObject({
    thresholdPercent: 90,
    paused: false,
  });
  for (const raw of [
    null,
    {},
    [],
    { ...wire, threshold_percent: NaN },
    { ...wire, threshold_percent: 101 },
    { ...wire, paused: 'true' },
    { ...wire, resets_at: '' },
  ]) {
    expect(normalizeWeeklyQuotaProtection(raw)).toBeUndefined();
  }
  expect(
    normalizeWeeklyQuotaProtection({ ...wire, used_percent: 101 })?.usedPercent
  ).toBeUndefined();
});

test('usage polling retains the credential protection status', () => {
  const result = normalizeUsageAccounts({
    status: { retention_days: 90, pending: 0, dropped: 0 },
    accounts: { test: { today: zero, seven_days: zero, weekly_quota_protection: wire } },
  });
  expect(result.accounts.test.weeklyQuotaProtection).toEqual(protection);
});

test('a held quota remains visible with a stale, lower or absent quota display cache', () => {
  const cached = { usedPercent: 1, stale: true, resetsAt: reset } as UsageQuota;
  for (const quota of [cached, { ...cached, stale: false }, undefined]) {
    const weekly = compactCodexWindows(undefined, quota, now, protection).find(
      (w) => w.id === 'weekly'
    );
    expect(weekly?.usedPercent).toBe(90.5);
    expect(weekly?.resetAtMs).toBe(Date.parse(reset));
  }
  expect(weeklyQuotaProtectionActive(protection, now)).toBe(true);
  expect(weeklyQuotaProtectionActive(protection, Date.parse(reset))).toBe(false);
  expect(weeklyQuotaProtectionActive(undefined, now)).toBe(false);
  expect(
    compactCodexWindows(undefined, cached, Date.parse(reset), protection).find(
      (w) => w.id === 'weekly'
    )?.usedPercent
  ).toBeNull();
});

test('all supported locales explain the threshold, paused reason and upstream reset', () => {
  for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr']) {
    const messages = JSON.parse(
      readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
    ).account_usage;
    expect(messages.weeklyProtectionLimit).toContain('{{threshold}}');
    expect(messages.weeklyProtectionPaused).toContain('{{threshold}}');
    expect(messages.weeklyProtectionReset).toContain('{{time}}');
  }
});

test('a configured threshold uses the current backend value', () => {
  const custom = normalizeWeeklyQuotaProtection({
    ...wire,
    threshold_percent: 80,
    used_percent: 82,
  })!;
  expect(custom.thresholdPercent).toBe(80);
  expect(
    compactCodexWindows(undefined, undefined, now, custom).find((w) => w.id === 'weekly')
      ?.usedPercent
  ).toBe(82);
});
