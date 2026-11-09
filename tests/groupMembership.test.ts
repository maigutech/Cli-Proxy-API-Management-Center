import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { normalizeGroupBoard } from '@/services/api/serviceGroups';
import { normalizeAuthFilesResponse } from '@/services/api/authFiles';
import {
  groupMembership,
  groupCounts,
  matchesGroup,
  UNASSIGNED_GROUP,
} from '@/features/serviceGroups/membership';
import {
  GroupMembershipBadges,
  GroupMembershipFilter,
} from '@/features/serviceGroups/GroupMembershipControls';
import zhCN from '@/i18n/locales/zh-CN.json';

const board = normalizeGroupBoard({
  mode: 'grouped',
  groups: [
    { id: 'a', name: '自用分组', members: [{ credential_id: 'shared' }] },
    {
      id: 'b',
      name: '服务分组',
      members: [{ credential_id: 'shared' }, { credential_id: 'other' }],
    },
    { id: 'archived', name: '旧组', archived: true, members: [{ credential_id: 'legacy' }] },
  ],
  credentials: [
    { id: 'shared', auth_id: 'runtime-1', name: 'renamed.json' },
    { id: 'other', auth_id: 'runtime-2' },
    { id: 'legacy', auth_id: 'runtime-3' },
    { id: 'shared', auth_id: 'conflict', conflict: true },
  ],
});
const files = normalizeAuthFilesResponse({
  files: [
    { id: 'runtime-1', name: 'new-name.json' },
    { id: 'runtime-2', name: 'other.json' },
    { id: 'runtime-3', name: 'old.json' },
    { id: 'unknown', name: 'renamed.json' },
    { id: 'conflict', name: 'conflict.json' },
  ],
}).files;

test('membership uses stable runtime identity and counts shared files once per group', () => {
  const member = groupMembership(board);
  expect(member(files.find((f) => f.authId === 'runtime-1')!)).toEqual([
    { id: 'a', name: '自用分组' },
    { id: 'b', name: '服务分组' },
  ]);
  expect(groupCounts(files, member)).toEqual({ '': 5, [UNASSIGNED_GROUP]: 3, a: 1, b: 2 });
  expect(files.filter((f) => matchesGroup(member(f), 'b'))).toHaveLength(2);
  expect(files.filter((f) => matchesGroup(member(f), UNASSIGNED_GROUP))).toHaveLength(3);
  expect(files.filter((f) => matchesGroup(member(f), ''))).toHaveLength(5);
  expect(member(files.find((f) => f.authId === 'unknown')!)).toEqual([]);
  expect(groupMembership(null)(files[0])).toEqual([]);
});

test('group controls show localized memberships and loading failures without false unassigned counts', async () => {
  const i18n = createInstance();
  await i18n.init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: zhCN } } });
  const render = (child: ReturnType<typeof createElement>) =>
    renderToStaticMarkup(createElement(I18nextProvider, { i18n, children: child }));
  const props = {
    board,
    value: 'b',
    counts: groupCounts(files, groupMembership(board)),
    onChange() {},
    loading: false,
    error: '',
  };
  const filter = render(createElement(GroupMembershipFilter, props));
  expect(filter).toContain('服务分组');
  expect(filter).toContain('aria-pressed="true"');
  expect(filter).not.toContain('旧组');
  const badges = render(
    createElement(GroupMembershipBadges, {
      groups: groupMembership(board)(files.find((f) => f.authId === 'runtime-1')!),
    })
  );
  expect(badges).toContain(zhCN.service_groups.sharedAccount);
  expect(badges).not.toContain('service_groups.');
  const failure = render(
    createElement(GroupMembershipFilter, { ...props, board: null, error: 'offline' })
  );
  expect(failure).toContain('role="alert"');
  expect(failure).not.toContain(zhCN.service_groups.unassigned);
});
