import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { apiClient } from '../src/services/api/client';
import {
  captureUsageApi,
  normalizePriceSyncStatus,
  normalizeModelPrice,
  serializeModelPrice,
  normalizeUsageAccounts,
  normalizeUsageTotals,
} from '../src/services/api/accountUsage';
import { AccountUsageCard } from '../src/features/usage/AccountUsageCard';
import { totalMoney, usageRange } from '../src/features/usage/format';
import en from '../src/i18n/locales/en.json';
import zhCN from '../src/i18n/locales/zh-CN.json';
import zhTW from '../src/i18n/locales/zh-TW.json';
import ru from '../src/i18n/locales/ru.json';
import vi from '../src/i18n/locales/vi.json';
import ko from '../src/i18n/locales/ko.json';
import tr from '../src/i18n/locales/tr.json';

const zero = {
  requests: 0,
  failed: 0,
  tokens: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  reasoning_tokens: 0,
  priced_requests: 0,
  unpriced_requests: 0,
  cost: 0,
};
const status = {
  ready: true,
  capture_since: '2026-11-08T00:00:00Z',
  complete_since: '2026-11-08T00:00:00Z',
  retention_days: 90,
  pending: 0,
  dropped: 0,
};
const price = {
  version: 1,
  provider: 'openai',
  model: 'gpt-5.4',
  tier: 'default',
  rates: { input: 0, output: 15, cache_read: null, cache_write: 0 },
  long_context_threshold: 272000,
  long_context: null,
  source: 'builtin',
  effective_at: status.capture_since,
};
const mocks: Array<{ mockRestore(): void }> = [];
afterEach(() => mocks.splice(0).forEach((m) => m.mockRestore()));

describe('account cost normalization', () => {
  test('keeps zero prices distinct from missing prices and preserves optimistic versions', () => {
    const normalized = normalizeModelPrice(price);
    const wire = serializeModelPrice(normalized);
    expect(wire.version).toBe(1);
    expect(wire.rates.input).toBe(0);
    expect(wire.rates.cache_read).toBeNull();
    expect(wire.rates.cache_write).toBe(0);
    expect(wire.long_context).toBeNull();
    expect(() => normalizeModelPrice({ ...price, rates: { output: 15 } })).toThrow();
    expect(() => normalizeModelPrice({ ...price, rates: { input: -1, output: 15 } })).toThrow();
  });

  test('does not display unknown request costs as zero', () => {
    expect(totalMoney()).toBe('—');
    expect(totalMoney(normalizeUsageTotals({ ...zero, requests: 1, unpriced_requests: 1 }))).toBe(
      '—'
    );
    expect(totalMoney(normalizeUsageTotals(zero))).toBe('$0.00');
    expect(totalMoney(normalizeUsageTotals({ ...zero, requests: 1, priced_requests: 1 }))).toBe(
      '$0.00'
    );
  });

  test('uses local midnight for today and exact rolling days for seven days', () => {
    const now = new Date('2026-11-10T10:00:00Z');
    const today = usageRange('today', '', '', now)!;
    expect(new Date(today.from).getHours()).toBe(0);
    expect(usageRange('seven', '', '', now)?.from).toBe('2026-11-03T10:00:00.000Z');
    expect(usageRange('custom', '', '', now)).toBeNull();
    expect(usageRange('custom', '2026-11-10T13:00', '2026-11-10T12:00', now)).toBeNull();
  });

  test('uses only v8 account-bound quota request and rejects stale writes', async () => {
    const client = apiClient.captureConnection();
    const post = spyOn(client, 'post').mockResolvedValue({ rate_limit: {} });
    const captured = spyOn(apiClient, 'captureConnection').mockReturnValue(client);
    const revision = spyOn(apiClient, 'getConnectionRevision').mockReturnValue(7);
    mocks.push(post, captured, revision);
    const api = captureUsageApi();
    await api.refreshQuota('account.json', 'account-1');
    expect(post).toHaveBeenCalledWith('/credentials/usage/quota', {
      name: 'account.json',
      auth_index: 'account-1',
    });
    revision.mockReturnValue(8);
    await expect(api.refreshQuota('account.json', 'account-1')).rejects.toThrow(
      'Connection changed'
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('account cost cards', () => {
  for (const [lng, translation] of Object.entries({
    en,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    ru,
    vi,
    ko,
    tr,
  })) {
    test('renders costs and honest unknowns in ' + lng, async () => {
      const i18n = createInstance();
      await i18n.init({
        lng,
        resources: { [lng]: { translation } },
        interpolation: { escapeValue: false },
      });
      const account = normalizeUsageAccounts({
        status,
        accounts: {
          a: {
            today: zero,
            seven_days: {
              ...zero,
              requests: 2,
              priced_requests: 1,
              unpriced_requests: 1,
              cost: 1.25,
            },
            exclusive: false,
            tracking_since: status.capture_since,
            quota: {
              used_percent: 25,
              remaining_percent: 75,
              stale: true,
              window_usage: zero,
              estimated_total: null,
              estimated_remaining: null,
              estimate_reason: 'stale_quota',
            },
          },
        },
      }).accounts.a;
      const markup = renderToStaticMarkup(
        createElement(
          I18nextProvider,
          { i18n },
          createElement(AccountUsageCard, { usage: account, onDetails: () => {} })
        )
      );
      expect(markup).toContain('$1.25');
      expect(markup).toContain(i18n.t('account_usage.stale'));
      expect(markup).not.toContain('<progress');
      expect(markup).not.toContain('account_usage.');
      expect(Object.keys(translation.account_usage).sort()).toEqual(
        Object.keys(en.account_usage).sort()
      );
    });
  }
});

const syncState = {
  enabled: true,
  running: false,
  interval_minutes: 10,
  source_url: 'https://example.com/prices',
  last_checked: '2026-11-08T12:00:00Z',
  last_updated: '',
  last_success: '',
  updated_rows: 0,
  skipped_rows: 2,
  catalog_rows: 100,
};
test('price sync normalization distinguishes missing and zero counts', () => {
  expect(normalizePriceSyncStatus(syncState).updatedRows).toBe(0);
  expect(normalizePriceSyncStatus(syncState).enabled).toBe(true);
  expect(() => normalizePriceSyncStatus({ ...syncState, running: 'false' })).toThrow();
  expect(() => normalizePriceSyncStatus({ ...syncState, catalog_rows: undefined })).toThrow();
});
test('sync controls use the captured v8 client and refuse stale connections', async () => {
  const client = apiClient.captureConnection();
  const post = spyOn(client, 'post').mockResolvedValue(syncState);
  const put = spyOn(client, 'put').mockResolvedValue(syncState);
  const captured = spyOn(apiClient, 'captureConnection').mockReturnValue(client);
  const revision = spyOn(apiClient, 'getConnectionRevision').mockReturnValue(7);
  mocks.push(post, put, captured, revision);
  const api = captureUsageApi();
  await api.syncPrices();
  await api.setPriceSyncEnabled(false);
  expect(post).toHaveBeenCalledWith('/observability/usage/prices/sync');
  expect(put).toHaveBeenCalledWith('/observability/usage/prices/sync', { enabled: false });
  revision.mockReturnValue(8);
  await expect(api.syncPrices()).rejects.toThrow('Connection changed');
  await expect(api.setPriceSyncEnabled(true)).rejects.toThrow('Connection changed');
  expect(post).toHaveBeenCalledTimes(1);
  expect(put).toHaveBeenCalledTimes(1);
});

test('retention settings read the current value and use only the captured connection', async () => {
  const client = apiClient.captureConnection();
  const get = spyOn(client, 'get').mockResolvedValue(status);
  const put = spyOn(client, 'put').mockResolvedValue({ ...status, retention_days: 7 });
  const captured = spyOn(apiClient, 'captureConnection').mockReturnValue(client);
  const revision = spyOn(apiClient, 'getConnectionRevision').mockReturnValue(21);
  mocks.push(get, put, captured, revision);
  const api = captureUsageApi();
  const controller = new AbortController();
  expect((await api.status(controller.signal)).retentionDays).toBe(90);
  expect(get).toHaveBeenCalledWith('/observability/usage/status', { signal: controller.signal });
  expect((await api.retention(7)).retentionDays).toBe(7);
  expect(put).toHaveBeenCalledWith('/observability/usage/settings', { retention_days: 7 });
  revision.mockReturnValue(22);
  await expect(api.status()).rejects.toThrow('Connection changed');
  await expect(api.retention(30)).rejects.toThrow('Connection changed');
  expect(get).toHaveBeenCalledTimes(1);
  expect(put).toHaveBeenCalledTimes(1);
});
