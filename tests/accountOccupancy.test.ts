import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { AccountOccupancy } from '../src/features/authFiles/components/AccountOccupancy';
import { normalizeSessionRoutingStatus } from '../src/services/api/sessionRouting';
import en from '../src/i18n/locales/en.json';

const values = {
  max_active_sessions: 10,
  max_concurrent_requests: 3,
  idle_ttl_seconds: 300,
  failover_ttl_seconds: 60,
};
const raw = {
  overrides: {},
  defaults: values,
  effective: values,
  active_sessions: 4,
  concurrent_requests: 2,
  editable: true,
  failover_enabled: true,
  observed_at: '2026-11-07T12:00:00Z',
};
const i18n = createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});
const render = (value: typeof raw | null) => {
  const snapshot = normalizeSessionRoutingStatus({ accounts: { account: value } }).account;
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(AccountOccupancy, { snapshot }))
  ).replace(/<[^>]+>/g, '');
};

describe('account occupancy cards', () => {
  test('shows current requests and active sessions against effective account limits', () => {
    const text = render(raw);
    expect(text).toContain('2 / 3');
    expect(text).toContain('4 / 10');
    const override = render({ ...raw, effective: { ...values, max_concurrent_requests: 7 } });
    expect(override).toContain('2 / 7');
  });
  test('zero usage is a real zero and zero limit is unlimited', () => {
    const text = render({
      ...raw,
      concurrent_requests: 0,
      effective: { ...values, max_concurrent_requests: 0 },
    });
    expect(text).toContain('0 / ∞');
    expect(text).not.toContain('0 / 0');
  });
  test('shows requests this minute against the account RPM limit', () => {
    const text = render({
      ...raw,
      current_rpm: 12,
      rpm_sticky_buffer_effective: 13,
      effective: { ...values, base_rpm: 60, rpm_sticky_buffer: 0, rpm_strategy: 'tiered' },
    } as typeof raw);
    expect(text).toContain('RPM');
    expect(text).toContain('12 / 60');
  });
  test('an account without an RPM limit shows it as unlimited, also on an older backend', () => {
    // An older backend sends no RPM fields at all: the card still renders and
    // reads as "no limit" rather than failing the whole page.
    const legacy = render({ ...raw, concurrent_requests: 1, active_sessions: 1 });
    expect(legacy).toContain('0 / ∞');
    expect(legacy).toContain('RPM');
  });
  test('unavailable accounts show unknown rather than a fabricated zero', () => {
    const text = render(null);
    expect(text.match(/— \/ —/g)).toHaveLength(3);
    expect(text).not.toContain('0 /');
    expect(() =>
      normalizeSessionRoutingStatus({
        accounts: { bad: { ...raw, concurrent_requests: undefined } },
      })
    ).toThrow();
  });
});
