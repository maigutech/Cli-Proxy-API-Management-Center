import { expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import type { AuthFileCardProps } from '../src/features/authFiles/components/AuthFileCard';
import { QUOTA_CLASS_KEYS } from '../src/features/quota/types';
import { codexPlanLabel } from '../src/utils/quota';

mock.module('../src/features/authFiles/components/AuthFileQuota.module.scss', () => ({
  default: Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
}));
const { AuthFileCard } = await import('../src/features/authFiles/components/AuthFileCard');

test('Codex plans are named the same way everywhere', () => {
  expect(codexPlanLabel(undefined)).toBeNull();
  expect(codexPlanLabel('  ')).toBeNull();
  expect(codexPlanLabel('self_serve_business_prolite')).toEqual({ key: 'plan_business_premium' });
  expect(codexPlanLabel('PRO')).toEqual({ key: 'plan_pro' });
  expect(codexPlanLabel('pro_lite')).toEqual({ key: 'plan_prolite' });
  expect(codexPlanLabel('promax')).toEqual({ key: 'plan_promax' });
  expect(codexPlanLabel('team')).toEqual({ key: 'plan_team' });
  expect(codexPlanLabel('enterprise_x')).toEqual({ raw: 'enterprise_x' });
});

const noop = () => {};
const base: AuthFileCardProps = {
  file: { name: 'a.json', type: 'codex' },
  compact: true,
  selected: false,
  resolvedTheme: 'light',
  disableControls: false,
  deleting: null,
  statusUpdating: {},
  manualRefreshing: {},
  cooldownResetting: {},
  quotaFilterType: null,
  statusBarCache: new Map(),
  onShowModels: noop,
  onDownload: noop,
  onManualRefresh: noop,
  onCooldownReset: noop,
  onOpenPrefixProxyEditor: noop,
  onDelete: noop,
  onToggleStatus: noop,
  onToggleSelect: noop,
};

const i18n = createInstance();
await i18n.init({ lng: 'cimode', resources: {}, react: { useSuspense: false } });
const render = (file: AuthFileCardProps['file']) =>
  renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(AuthFileCard, { ...base, file }))
  );

test('a Codex card shows its plan, with the raw value in the tooltip', () => {
  const html = render({ name: 'a.json', type: 'codex', plan_type: 'self_serve_business_prolite' });
  expect(html).toContain('codex_quota.plan_business_premium');
  expect(html).toContain('self_serve_business_prolite');
  expect(render({ name: 'b.json', type: 'codex', metadata: { plan_type: 'pro' } })).toContain(
    'codex_quota.plan_pro'
  );
});

test('cards without a plan, or of other providers, show none', () => {
  expect(render({ name: 'a.json', type: 'codex' })).not.toContain('codex_quota.plan_');
  expect(render({ name: 'c.json', type: 'claude', plan_type: 'pro' })).not.toContain(
    'codex_quota.plan_'
  );
});
