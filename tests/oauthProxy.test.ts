import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { apiClient } from '@/services/api/client';
import { oauthApi } from '@/services/api/oauth';
import { OAuthFlowDialog } from '@/features/oauth/components/OAuthFlowDialog';
import { isValidOAuthProxyUrl } from '@/features/oauth/proxyUrl';
import en from '@/i18n/locales/en.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

describe('OAuth session proxy API', () => {
  test('posts a trimmed proxy only in the request body for the current account', async () => {
    const response = { url: 'https://auth.example.test/authorize', state: 'proxy-state' };
    const get = spyOn(apiClient, 'get');
    const post = spyOn(apiClient, 'post').mockResolvedValue(response);
    const signal = new AbortController().signal;
    try {
      expect(
        await oauthApi.startAuth('codex', signal, ' http://user:pass@127.0.0.1:8080 ')
      ).toEqual(response);
      expect(post).toHaveBeenCalledWith(
        '/oauth/auth-url',
        {
          provider: 'codex',
          is_webui: true,
          proxy_url: 'http://user:pass@127.0.0.1:8080',
        },
        { signal }
      );
      expect(get).not.toHaveBeenCalled();
    } finally {
      get.mockRestore();
      post.mockRestore();
    }
  });

  test('keeps the existing GET flow when proxy is blank', async () => {
    const response = { url: 'https://auth.example.test/authorize', state: 'default-state' };
    const get = spyOn(apiClient, 'get').mockResolvedValue(response);
    const post = spyOn(apiClient, 'post');
    try {
      expect(await oauthApi.startAuth('codex', undefined, '   ')).toEqual(response);
      expect(get).toHaveBeenCalledWith('/oauth/auth-url', {
        params: { provider: 'codex', is_webui: true },
      });
      expect(post).not.toHaveBeenCalled();
    } finally {
      get.mockRestore();
      post.mockRestore();
    }
  });

  test('supports a session proxy for plugin providers without adding web UI mode', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({ url: 'https://sso.example.test' });
    try {
      await oauthApi.startAuth('example-plugin', undefined, 'socks5://127.0.0.1:1080');
      expect(post).toHaveBeenCalledWith(
        '/oauth/auth-url',
        { provider: 'example-plugin', proxy_url: 'socks5://127.0.0.1:1080' },
        undefined
      );
    } finally {
      post.mockRestore();
    }
  });
});

describe('OAuth proxy URL validation', () => {
  test('accepts blank, authenticated, HTTP(S), and SOCKS proxy URLs with explicit ports', () => {
    for (const proxyUrl of [
      '',
      '   ',
      'http://127.0.0.1:8080',
      'https://proxy.example.test:443/',
      'http://user:pass@proxy.example.test:8080',
      'socks5://127.0.0.1:1080',
      'socks5h://[::1]:1080',
    ]) {
      expect(isValidOAuthProxyUrl(proxyUrl)).toBe(true);
    }
  });

  test('rejects malformed URLs, missing ports, unsupported schemes, paths, queries, and fragments', () => {
    for (const proxyUrl of [
      'not-a-url',
      'direct',
      'ftp://127.0.0.1:21',
      'http://127.0.0.1',
      'http://127.0.0.1:0',
      'http://127.0.0.1:99999',
      'http://127.0.0.1:',
      'http://:8080',
      'socks5://127.0.0.1',
      'http://127.0.0.1:8080/proxy',
      'http://127.0.0.1:8080?target=upstream',
      'http://127.0.0.1:8080#fragment',
    ]) {
      expect(isValidOAuthProxyUrl(proxyUrl)).toBe(false);
    }
  });
});

describe('OAuth proxy setup UI', () => {
  test('renders the per-account proxy field and inline validation before login', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(OAuthFlowDialog, {
          open: true,
          providerId: 'codex',
          heading: { title: en.auth_login.codex_oauth_title, caption: 'Browser', icon: '' },
          state: {
            proxyUrl: 'http://127.0.0.1:8080',
            proxyValidation: en.auth_login.oauth_proxy_invalid,
          },
          text: (suffix: string) => i18n.t(`auth_login.codex_${suffix}`),
          supportsCallback: true,
          onStart: () => {},
          onCancel: () => {},
          onProxyChange: () => {},
          onLoginAnother: () => {},
          onCallbackChange: () => {},
          onCallbackSubmit: () => {},
          onViewAuthFiles: () => {},
          onClose: () => {},
        })
      )
    );
    expect(markup).toContain(en.auth_login.oauth_proxy_label);
    expect(markup).toContain(en.auth_login.oauth_proxy_hint.replaceAll("'", '&#x27;'));
    expect(markup).toContain('value="http://127.0.0.1:8080"');
    expect(markup).toContain(en.auth_login.oauth_proxy_invalid);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).not.toContain('auth_login.');
  });

  test('provides proxy setup translations in every supported locale', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr']) {
      const { auth_login: messages } = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')
      ) as { auth_login: Record<string, string> };
      for (const key of [
        'oauth_proxy_label',
        'oauth_proxy_hint',
        'oauth_proxy_placeholder',
        'oauth_proxy_invalid',
      ]) {
        expect(messages[key]?.trim()).toBeTruthy();
      }
    }
  });
});
