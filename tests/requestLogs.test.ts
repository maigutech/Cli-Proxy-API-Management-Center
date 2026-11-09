import { afterEach, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { apiClient } from '../src/services/api/client';
import { normalizeUsageRecord } from '../src/services/api/accountUsage';
import {
  captureRequestLogsApi,
  normalizeRequestLogs,
  requestLogParams,
} from '../src/services/api/requestLogs';
import {
  buildLogQuery,
  defaultFilters,
  duration,
  latency,
  pageQuery,
} from '../src/features/requestLogs/format';
import { RequestLogTable } from '../src/features/requestLogs/RequestLogsPage';
import { RequestLogDetail } from '../src/features/requestLogs/RequestLogDetail';
import en from '../src/i18n/locales/en.json';
import zhCN from '../src/i18n/locales/zh-CN.json';
import zhTW from '../src/i18n/locales/zh-TW.json';
import ru from '../src/i18n/locales/ru.json';
import vi from '../src/i18n/locales/vi.json';
import ko from '../src/i18n/locales/ko.json';
import tr from '../src/i18n/locales/tr.json';

const record = {
  sequence: 4,
  execution_id: 'exec-1',
  trace_id: 'trace-1',
  auth_index: 'account-1',
  provider: 'codex',
  requested_at: '2026-11-08T10:00:00Z',
  completed_at: '2026-11-08T10:00:02Z',
  requested_model: 'alias',
  upstream_model: 'gpt-5.4',
  pricing_model: 'gpt-5.4',
  source: 'business',
  transport: 'websocket',
  stream: true,
  failed: true,
  status_code: 503,
  service_tier: 'default',
  cost_status: 'usage_unknown',
  cost: null,
  price: null,
  tokens: {
    input: { uncached_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
    output: { total_tokens: 0, reasoning_tokens: 0 },
  },
};
const response = {
  status: {
    ready: true,
    capture_since: record.requested_at,
    complete_since: record.requested_at,
    retention_days: 90,
    pending: 0,
    dropped: 0,
  },
  summary: {
    requests: 1,
    failed: 1,
    tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    priced_requests: 0,
    unpriced_requests: 1,
    cost: 0,
  },
  records: [record],
  accounts: [{ auth_index: 'account-1', name: 'Demo account' }],
  models: ['gpt-5.4'],
  total: 1,
  page: 1,
  page_size: 25,
  total_pages: 1,
  snapshot: 4,
};
const mocks: Array<{ mockRestore(): void }> = [];
afterEach(() => mocks.splice(0).forEach((m) => m.mockRestore()));

test('unknown costs, missing TTFT and success HTTP codes are not invented', () => {
  const result = normalizeRequestLogs(response);
  expect(result.records[0].statusCode).toBe(503);
  expect(result.records[0].cost).toBeNull();
  expect(result.records[0].ttftMs).toBeNull();
  expect(latency(result.records[0])).toBe(2000);
  const historical = normalizeUsageRecord({
    ...record,
    completed_at: undefined,
    status_code: 0,
    failed: false,
  });
  expect(historical.statusCode).toBeNull();
  expect(latency(historical)).toBeNull();
  expect(duration(null)).toBe('—');
  expect(normalizeUsageRecord({ ...record, ttft_ms: 0 }).ttftMs).toBe(0);
  expect(() => normalizeRequestLogs({ ...response, total: -1 })).toThrow();
  expect(() => normalizeRequestLogs({ ...response, page: 0 })).toThrow();
});

test('paging preserves the time window, zero watermark, and false streaming filter', () => {
  const initial = buildLogQuery(
    { ...defaultFilters, stream: 'false', requestId: ' trace-1 ' },
    50,
    new Date('2026-11-08T12:00:00Z')
  )!;
  expect(initial.from).toBe('2026-11-07T12:00:00.000Z');
  const page = pageQuery(initial, 2, 0);
  expect(page.from).toBe(initial.from);
  expect(page.to).toBe(initial.to);
  expect(requestLogParams(page)).toMatchObject({
    page: 2,
    page_size: 50,
    snapshot: 0,
    stream: false,
    request_id: 'trace-1',
  });
  expect(buildLogQuery(defaultFilters)!.snapshot).toBeUndefined();
  expect(buildLogQuery({ ...defaultFilters, range: 'custom' })).toBeNull();
  expect(buildLogQuery({ ...defaultFilters, statusCode: '999' })).toBeNull();
  expect(
    buildLogQuery({
      ...defaultFilters,
      range: 'custom',
      from: '2026-11-08T13:00',
      to: '2026-11-08T12:00',
    })
  ).toBeNull();
});

test('captured API rejects stale dispatch and late results after connection changes', async () => {
  const client = apiClient.captureConnection();
  let resolve!: (value: unknown) => void;
  const get = spyOn(client, 'get').mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const capture = spyOn(apiClient, 'captureConnection').mockReturnValue(client);
  const revision = spyOn(apiClient, 'getConnectionRevision').mockReturnValue(10);
  mocks.push(get, capture, revision);
  const api = captureRequestLogsApi();
  const query = buildLogQuery(defaultFilters)!;
  const controller = new AbortController();
  const task = api.list(query, controller.signal);
  expect(get).toHaveBeenCalledWith('/observability/request-logs', {
    params: requestLogParams(query),
    signal: controller.signal,
  });
  revision.mockReturnValue(11);
  resolve(response);
  await expect(task).rejects.toThrow('Connection changed');
  await expect(api.list(query)).rejects.toThrow('Connection changed');
  expect(get).toHaveBeenCalledTimes(1);
});

for (const [lng, translation] of Object.entries({
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ru,
  vi,
  ko,
  tr,
})) {
  test('renders localized compact records and details in ' + lng, async () => {
    const i18n = createInstance();
    await i18n.init({
      lng,
      resources: { [lng]: { translation } },
      interpolation: { escapeValue: false },
    });
    const row = normalizeUsageRecord(record);
    const render = (child: ReturnType<typeof createElement>) =>
      renderToStaticMarkup(createElement(I18nextProvider, { i18n, children: child }));
    const table = render(
      createElement(RequestLogTable, {
        records: [row],
        accounts: [{ authIndex: 'account-1', name: 'Demo account' }],
        onDetail() {},
        onTrace() {},
      })
    );
    expect(table).toContain('503');
    expect(table).toContain('Demo account');
    expect(table).toContain('WebSocket');
    expect(table).not.toContain('$0.00');
    expect(table).not.toContain('request_logs.');
    const success = render(
      createElement(RequestLogTable, {
        records: [{ ...row, failed: false, statusCode: null }],
        accounts: [],
        onDetail() {},
        onTrace() {},
      })
    );
    expect(success).not.toContain('· 200');
    const detail = render(
      createElement(RequestLogDetail, { row, account: 'Demo account', onTrace() {} })
    );
    expect(detail).toContain('exec-1');
    expect(detail).not.toContain('request_logs.');
    expect(detail).not.toContain('$0.00');
    expect(Object.keys(translation.request_logs).sort()).toEqual(
      Object.keys(en.request_logs).sort()
    );
  });
}

test('group filters persist through pagination and distinguish unattributed history from all groups', () => {
  const q = buildLogQuery({ ...defaultFilters, groupId: 'archived-group' })!;
  expect(requestLogParams(pageQuery(q, 2, 3)).group_id).toBe('archived-group');
  const unassigned = buildLogQuery({ ...defaultFilters, groupId: '__unassigned__' })!;
  expect(requestLogParams(unassigned).group_id).toBeUndefined();
  expect(requestLogParams(unassigned).group_unassigned).toBe(true);
  expect(requestLogParams(buildLogQuery(defaultFilters)!).group_unassigned).toBeUndefined();
});

test('request group identity comes from immutable record attribution', async () => {
  const group = { id: 'group-a', name: 'Archived team', archived: true };
  const result = normalizeRequestLogs({
    ...response,
    groups: [group],
    records: [{ ...record, group_id: 'group-a', key_id: 'key-a', credential_id: 'shared' }],
  });
  expect(result.records[0]).toMatchObject({
    groupId: 'group-a',
    keyId: 'key-a',
    credentialId: 'shared',
  });
  expect(result.groups).toEqual([group]);
  expect(normalizeRequestLogs(response).groups).toEqual([]);
  const i18n = createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: en } } });
  const html = renderToStaticMarkup(
    createElement(I18nextProvider, {
      i18n,
      children: createElement(RequestLogTable, {
        records: result.records,
        groups: result.groups,
        accounts: [],
        onDetail() {},
        onTrace() {},
      }),
    })
  );
  expect(html).toContain('Archived team');
  expect(html).toContain(en.request_logs.archivedGroup);
  expect(html).not.toContain(en.request_logs.unassignedGroup);
});
