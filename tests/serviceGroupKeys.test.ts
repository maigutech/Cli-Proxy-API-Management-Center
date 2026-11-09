import { describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { GroupKeyControl } from '@/features/serviceGroups/GroupKeyControl';
import { newGroup } from '@/features/serviceGroups/logic';
import { apiClient } from '@/services/api/client';
import { captureServiceGroupsApi, normalizeGroup } from '@/services/api/serviceGroups';

describe('retrievable group keys', () => {
  const group = {
    ...newGroup(),
    id: 'group/a',
    keyVersion: 3,
    keyAvailable: true,
    keyPrefix: 'sk-cpa-1234••••••••5678',
  };
  test('renders a masked key and copy/reveal controls without requesting the secret', () => {
    const capture = spyOn(apiClient, 'captureConnection');
    try {
      const html = renderToStaticMarkup(
        createElement(GroupKeyControl, {
          group,
          onRestored: async () => {},
        })
      );
      expect(html).toContain(group.keyPrefix);
      expect(html).toContain(i18n.t('service_groups.copy'));
      expect(html).toContain(i18n.t('service_groups.showKey'));
      expect(capture).not.toHaveBeenCalled();
    } finally {
      capture.mockRestore();
    }
  });
  test('digest-only keys offer restoration without automatically rotating', () => {
    const html = renderToStaticMarkup(
      createElement(GroupKeyControl, {
        group: { ...group, keyAvailable: false },
        onRestored: async () => {},
      })
    );
    expect(html).toContain(i18n.t('service_groups.keyNotRetained'));
    expect(html).toContain(i18n.t('service_groups.restoreKey'));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  test('lists discard raw key material and preserve retrieval availability', () => {
    const normalized = normalizeGroup({
      key: 'fixture-secret',
      encrypted_secret: 'ciphertext',
      key_available: true,
    });
    expect(normalized.keyAvailable).toBe(true);
    expect(JSON.stringify(normalized)).not.toContain('fixture-secret');
    expect(JSON.stringify(normalized)).not.toContain('ciphertext');
  });
  test('retrieval and restoration are pinned to the selected key version', async () => {
    const client = apiClient.captureConnection();
    const capture = spyOn(apiClient, 'captureConnection').mockReturnValue(client);
    const get = spyOn(client, 'get').mockResolvedValue({ key: 'fixture-secret', key_version: 3 });
    const put = spyOn(client, 'put').mockResolvedValue({ version: 10 });
    try {
      const api = captureServiceGroupsApi();
      expect(await api.key(group)).toBe('fixture-secret');
      expect(get).toHaveBeenCalledWith('/service-groups/group%2Fa/key?key_version=3');
      await api.restoreKey(group, 'fixture-secret');
      expect(put).toHaveBeenCalledWith('/service-groups/group%2Fa/key', {
        key: 'fixture-secret',
        key_version: 3,
      });
      get.mockResolvedValue({ key: 'obsolete', key_version: 2 });
      await expect(api.key(group)).rejects.toThrow('Invalid service group key response');
    } finally {
      get.mockRestore();
      put.mockRestore();
      capture.mockRestore();
    }
  });
});
