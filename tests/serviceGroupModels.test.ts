import { describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { apiClient } from '@/services/api/client';
import { captureServiceGroupsApi } from '@/services/api/serviceGroups';
import { addableModels, appendModels } from '@/features/serviceGroups/logic';
import { GroupModelCandidates } from '@/features/serviceGroups/GroupModelCandidates';

describe('group pool model retrieval', () => {
  test('adding candidates preserves aliases, order, and edits without broadening alias targets', () => {
    const existing = [
      { name: 'custom-alias', target: 'upstream-a' },
      { name: 'upstream-b', target: 'upstream-c' },
      { name: '', target: '' },
    ];
    const candidates = [
      'upstream-a',
      'upstream-b',
      'upstream-c',
      'new-model',
      'new-model',
      'auto',
      '',
    ];
    expect(addableModels(existing, candidates)).toEqual(['new-model']);
    const merged = appendModels(existing, candidates);
    expect(merged).toEqual([...existing, { name: 'new-model', target: 'new-model' }]);
    expect(existing).toHaveLength(3);
    expect(appendModels(merged, candidates)).toEqual(merged);
  });
  test('fetches each time using unsaved member IDs and the captured connection without writing a group', async () => {
    const client = apiClient.captureConnection();
    const capture = spyOn(apiClient, 'captureConnection').mockReturnValue(client);
    const post = spyOn(client, 'post').mockResolvedValue({
      models: ['fresh-b', 'fresh-a', 'fresh-b', 'auto'],
      fetched_at: '2026-11-09T06:00:00Z',
      credentials: [{ id: 'draft-b', models: ['fresh-b'], access_token: 'not-for-ui' }],
    });
    try {
      const api = captureServiceGroupsApi();
      const result = await api.modelCandidates([{ credentialId: 'draft-b', priority: 8 }]);
      expect(post).toHaveBeenCalledWith('/service-groups/model-candidates', {
        members: [{ credential_id: 'draft-b' }],
      });
      expect(result.models).toEqual(['fresh-a', 'fresh-b']);
      expect(result.fetchedAt).toBe('2026-11-09T06:00:00Z');
      expect(result.credentials[0].id).toBe('draft-b');
      expect(JSON.stringify(result)).not.toContain('not-for-ui');
      post.mockResolvedValue({
        models: ['latest'],
        credentials: [],
        fetched_at: '2026-11-09T06:01:00Z',
      });
      expect((await api.modelCandidates([])).models).toEqual(['latest']);
      expect(post).toHaveBeenCalledTimes(2);
      expect(capture).toHaveBeenCalledTimes(1);
    } finally {
      post.mockRestore();
      capture.mockRestore();
    }
  });
  test('empty pools explain why fetching is unavailable and rendering does not fetch or add', () => {
    const capture = spyOn(apiClient, 'captureConnection');
    try {
      const html = renderToStaticMarkup(
        createElement(GroupModelCandidates, {
          members: [],
          models: [],
          disabled: false,
          onFetched: () => {},
          onAdd: () => {},
        })
      );
      expect(html).toContain(i18n.t('service_groups.fetchModels'));
      expect(html).toContain(i18n.t('service_groups.selectMembersFirst'));
      expect(html).toContain('disabled=""');
      expect(capture).not.toHaveBeenCalled();
    } finally {
      capture.mockRestore();
    }
  });
});
