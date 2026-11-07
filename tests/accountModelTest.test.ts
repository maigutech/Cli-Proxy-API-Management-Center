import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import {
  captureAccountModelTestApi,
  normalizeAccountTestInfo,
  normalizeAccountTestResult,
} from '../src/services/api/accountModelTest';

const route = {
  source: 'account',
  mode: 'proxy',
  endpoint: 'socks5://192.0.2.7:1080',
  valid: true,
};
const info = {
  models: ['small-model', 'large-model', 'small-model'],
  route,
  prompt: 'Reply with exactly OK.',
  auth_index: 'stable-index',
};
const result = {
  success: true,
  model: 'small-model',
  auth_index: 'stable-index',
  duration_ms: 123,
  route,
  output: 'OK',
};
afterEach(() => apiClient.setConfig({ apiBase: '', managementKey: '' }));

describe('account model testing', () => {
  test('normalizes account-specific models and safe route information', () => {
    expect(normalizeAccountTestInfo(info)).toEqual({
      models: ['small-model', 'large-model'],
      route,
      prompt: info.prompt,
      authIndex: 'stable-index',
    });
    expect(normalizeAccountTestResult(result)).toMatchObject({
      success: true,
      durationMs: 123,
      authIndex: 'stable-index',
      output: 'OK',
    });
    expect(
      normalizeAccountTestResult({
        ...result,
        success: false,
        output: '',
        error_code: 'auth_failed',
        http_status: 401,
      })
    ).toMatchObject({ success: false, errorCode: 'auth_failed', httpStatus: 401 });
  });
  test('rejects malformed responses instead of inventing a successful test', () => {
    for (const value of [
      null,
      {},
      { ...info, models: [null] },
      { ...info, auth_index: null },
      { ...info, route: { ...route, source: 'unrecognized' } },
    ]) {
      expect(() => normalizeAccountTestInfo(value)).toThrow();
    }
    for (const value of [
      { ...result, success: 'true' },
      { ...result, duration_ms: -1 },
      { ...result, duration_ms: NaN },
      { ...result, output: null },
    ]) {
      expect(() => normalizeAccountTestResult(value)).toThrow();
    }
  });
  test('pins the management connection and credential, passes cancellation and disables request timeout', async () => {
    apiClient.setConfig({ apiBase: 'https://original.invalid', managementKey: 'fixture' });
    const captured = apiClient.captureConnection();
    const capture = spyOn(apiClient, 'captureConnection').mockReturnValue(captured);
    const get = spyOn(captured, 'get').mockResolvedValue(info);
    const post = spyOn(captured, 'post').mockResolvedValue(result);
    try {
      const api = captureAccountModelTestApi();
      const controller = new AbortController();
      expect(await api.get('account.json', 'stable-index', controller.signal)).toMatchObject({
        authIndex: 'stable-index',
      });
      expect(get).toHaveBeenCalledWith('/credentials/model-test', {
        params: { name: 'account.json', auth_index: 'stable-index' },
        signal: controller.signal,
      });
      expect(
        await api.run('account.json', 'stable-index', 'small-model', controller.signal)
      ).toMatchObject({ success: true });
      expect(post).toHaveBeenCalledWith(
        '/credentials/model-test',
        { name: 'account.json', auth_index: 'stable-index', model: 'small-model' },
        { signal: controller.signal, timeout: 0 }
      );
      apiClient.setConfig({ apiBase: 'https://other.invalid', managementKey: 'other' });
      expect(api.isCurrent()).toBe(false);
      await expect(
        api.run('account.json', 'stable-index', 'small-model', controller.signal)
      ).rejects.toThrow('Connection changed');
      apiClient.setConfig({ apiBase: 'https://original.invalid', managementKey: 'fixture' });
      expect(api.isCurrent()).toBe(false);
      await expect(api.get('account.json', 'stable-index', controller.signal)).rejects.toThrow(
        'Connection changed'
      );
      expect(post).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      capture.mockRestore();
      get.mockRestore();
      post.mockRestore();
    }
  });
  test('all supported languages contain model test labels and failure explanations', async () => {
    const languages = ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr'];
    const english = (await import('../src/i18n/locales/en.json')).default.account_test;
    for (const language of languages) {
      const translation = (await import(`../src/i18n/locales/${language}.json`)).default
        .account_test;
      expect(Object.keys(translation).sort()).toEqual(Object.keys(english).sort());
      expect(Object.keys(translation.errors).sort()).toEqual(Object.keys(english.errors).sort());
      expect(translation.title.length).toBeGreaterThan(0);
    }
  });
});
