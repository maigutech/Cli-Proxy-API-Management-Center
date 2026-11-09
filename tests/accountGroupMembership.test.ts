import { expect, spyOn, test } from 'bun:test';
import { apiClient } from '@/services/api/client';
import { captureServiceGroupsApi, normalizeGroupBoard } from '@/services/api/serviceGroups';
import {
  credentialGroupIds,
  membershipCredential,
  membershipRemovalIssue,
} from '@/features/serviceGroups/accountMembership';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ko from '@/i18n/locales/ko.json';
import ru from '@/i18n/locales/ru.json';
import tr from '@/i18n/locales/tr.json';
import vi from '@/i18n/locales/vi.json';

const fixture = () =>
  normalizeGroupBoard({
    version: 5,
    mode: 'grouped',
    groups: [
      {
        id: 'a',
        name: 'Own',
        enabled: true,
        members: [{ credential_id: 'cred/a' }],
        models: [{ name: 'public', target: 'model-a' }],
      },
      {
        id: 'b',
        name: 'Shared',
        enabled: true,
        members: [{ credential_id: 'cred/a' }, { credential_id: 'other' }],
        models: [{ name: 'public', target: 'model-b' }],
      },
      { id: 'c', name: 'Disabled', members: [{ credential_id: 'cred/a' }] },
      { id: 'old', archived: true, members: [{ credential_id: 'cred/a' }] },
    ],
    credentials: [
      { id: 'cred/a', auth_id: 'runtime-a', name: 'old-name.json', models: ['model-a', 'model-b'] },
      { id: 'other', auth_id: 'runtime-b', models: ['model-a'] },
    ],
  });

test('membership editing resolves stable identity and excludes archived groups', () => {
  const board = fixture();
  const credential = membershipCredential(board, { name: 'renamed.json', authId: 'runtime-a' });
  expect(credential?.id).toBe('cred/a');
  expect(credentialGroupIds(board, credential!.id)).toEqual(['a', 'b', 'c']);
  expect(membershipCredential(board, { name: 'old-name.json' })).toBeNull();
  expect(membershipCredential(board, { name: 'old-name.json', authId: 'missing' })).toBeNull();
  board.credentials[0].conflict = true;
  expect(membershipCredential(board, { name: 'renamed.json', authId: 'runtime-a' })).toBeNull();
  expect(membershipCredential(null, { name: 'old-name.json' })).toBeNull();
});

test('removals explain loss of the last member or a supported model', () => {
  const board = fixture();
  expect(membershipRemovalIssue(board, 'cred/a', ['b', 'c'])).toEqual({
    key: 'membershipLastMember',
    group: 'Own',
  });
  expect(membershipRemovalIssue(board, 'cred/a', ['a'])).toEqual({
    key: 'membershipModelRequired',
    group: 'Shared',
    model: 'public',
  });
  board.credentials[1].models.push('model-b');
  expect(membershipRemovalIssue(board, 'cred/a', ['a'])).toBeNull();
  expect(membershipRemovalIssue(board, 'cred/a', ['a', 'b'])).toBeNull();
  board.groups[0].enabled = false;
  expect(membershipRemovalIssue(board, 'cred/a', [])).toBeNull();
});

test('one versioned request replaces all memberships and returns a normalized board', async () => {
  const client = apiClient.captureConnection();
  const capture = spyOn(apiClient, 'captureConnection').mockReturnValue(client);
  const put = spyOn(client, 'put').mockResolvedValue({
    version: 6,
    mode: 'grouped',
    groups: [{ id: 'b', members: [{ credential_id: 'cred/a', weight: 12 }] }],
  });
  try {
    const api = captureServiceGroupsApi();
    const next = await api.setMemberships('cred/a', ['a', 'b'], 5);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('/service-groups/credentials/cred%2Fa/memberships', {
      version: 5,
      group_ids: ['a', 'b'],
    });
    expect(next.version).toBe(6);
    expect(next.groups[0].members[0].weight).toBe(12);
    await api.setMemberships('cred/a', [], 6);
    expect(put).toHaveBeenLastCalledWith('/service-groups/credentials/cred%2Fa/memberships', {
      version: 6,
      group_ids: [],
    });
    const revision = spyOn(apiClient, 'getConnectionRevision').mockReturnValue(api.revision + 1);
    try {
      expect(api.isCurrent()).toBe(false);
      await expect(api.setMemberships('cred/a', [], 6)).rejects.toThrow('Connection changed');
      expect(put).toHaveBeenCalledTimes(2);
    } finally {
      revision.mockRestore();
    }
    expect(api.isCurrent()).toBe(true);
  } finally {
    put.mockRestore();
    capture.mockRestore();
  }
});

test('membership editor labels and safeguards are localized in all supported languages', () => {
  for (const messages of [en, zhCN, zhTW, ko, ru, tr, vi]) {
    for (const key of [
      'groupButton',
      'editMemberships',
      'membershipEditorHint',
      'searchGroups',
      'noMatchingGroups',
      'noMembershipGroups',
      'selectedGroups',
      'unassignedWarning',
      'membershipLastMember',
      'membershipModelRequired',
      'membershipConflict',
      'reloadMemberships',
      'membershipsSaved',
    ] as const) {
      expect(messages.service_groups[key].trim()).not.toBe('');
    }
    expect(messages.service_groups.selectedGroups).toContain('{{count}}');
    expect(messages.service_groups.membershipLastMember).toContain('{{group}}');
    expect(messages.service_groups.membershipModelRequired).toContain('{{model}}');
  }
});
