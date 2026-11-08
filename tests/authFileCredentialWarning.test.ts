import { expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import type { AuthFileCardProps } from '../src/features/authFiles/components/AuthFileCard';
import { QUOTA_CLASS_KEYS } from '../src/features/quota/types';
import en from '../src/i18n/locales/en.json';
import zhCN from '../src/i18n/locales/zh-CN.json';
import zhTW from '../src/i18n/locales/zh-TW.json';
import ru from '../src/i18n/locales/ru.json';
import vi from '../src/i18n/locales/vi.json';
import ko from '../src/i18n/locales/ko.json';
import tr from '../src/i18n/locales/tr.json';

mock.module('../src/features/authFiles/components/AuthFileQuota.module.scss', () => ({
  default: Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
}));
const { AuthFileCard } = await import('../src/features/authFiles/components/AuthFileCard');

const noop = () => {};
const props: AuthFileCardProps = {
  file: { name: 'example.json', type: 'codex' },
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
  probeStatus: { auth_id: 'example.json', state: 'clear', last_verdict: 'healthy' },
};

for (const [locale, messages] of Object.entries({
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ru,
  vi,
  ko,
  tr,
})) {
  test(`credential recovery warnings are clear and localized in ${locale}`, async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: locale,
      resources: { [locale]: { translation: messages } },
      interpolation: { escapeValue: false },
    });
    const render = (overrides: Partial<AuthFileCardProps>) =>
      renderToStaticMarkup(
        createElement(
          I18nextProvider,
          { i18n },
          createElement(AuthFileCard, { ...props, ...overrides })
        )
      );
    const expired = render({ file: { ...props.file, requiresSignIn: true } });
    expect(expired).toContain(messages.auth_files.sign_in_required);
    expect(expired).toContain('role="status"');
    expect(expired).not.toContain(messages.auth_files.probe_label);
    expect(expired).not.toContain('auth_files.sign_in_required');

    const failed = render({
      probeStatus: { ...props.probeStatus!, last_error: 'temporary probe error' },
    });
    expect(failed).toContain(messages.auth_files.probe_failed);
    expect(failed).not.toContain(messages.auth_files.sign_in_required);
    expect(failed).not.toContain(messages.auth_files.probe_last_verdict);

    const recovered = render({ file: { ...props.file, requiresSignIn: false } });
    expect(recovered).not.toContain(messages.auth_files.sign_in_required);
    expect(recovered).not.toContain(messages.auth_files.probe_failed);
    expect(recovered).toContain(messages.auth_files.probe_label);
  });
}
