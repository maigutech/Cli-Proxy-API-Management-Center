import { describe, expect, test } from 'bun:test';
import { normalizeGroupBoard, normalizeGroup, serializeGroup } from '@/services/api/serviceGroups';
import { groupIssues, newGroup, poolModels, supportedModels } from '@/features/serviceGroups/logic';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';
import vi from '@/i18n/locales/vi.json';
import ko from '@/i18n/locales/ko.json';
import tr from '@/i18n/locales/tr.json';

const credential = {
  id: 'a',
  authId: 'runtime-a',
  name: 'Account A',
  provider: 'codex',
  disabled: false,
  conflict: false,
  models: ['m-a'],
  groups: ['shared'],
};
describe('service group authorization editor', () => {
  const keys = (issues: ReturnType<typeof groupIssues>, blocking: boolean) =>
    issues.filter((issue) => issue.blocking === blocking).map((issue) => issue.key);

  test('new groups start disabled with no accidental authorization', () => {
    expect(newGroup().enabled).toBe(false);
    expect(newGroup().models).toEqual([]);
  });
  test('a group can be saved and enabled before it has accounts or models', () => {
    const issues = groupIssues({ ...newGroup(), name: 'test', enabled: true }, []);
    expect(keys(issues, true)).toEqual([]);
    expect(keys(issues, false)).toEqual(['noMembers', 'noModels']);
    // A paused group serves nothing, so an empty one needs no warning.
    expect(groupIssues({ ...newGroup(), name: 'test' }, [])).toEqual([]);
  });
  test('model choices use only explicit members and exclude duplicate identities', () => {
    const group = { ...newGroup(), name: 'A', members: [{ credentialId: 'a' }] };
    expect(
      supportedModels(group, [credential, { ...credential, id: 'b', models: ['private-b'] }])
    ).toEqual(['m-a']);
    expect(supportedModels(group, [{ ...credential, conflict: true }])).toEqual([]);
  });
  test('a model no member supports yet is flagged on its row without blocking the save', () => {
    const group = {
      ...newGroup(),
      name: 'A',
      enabled: true,
      members: [{ credentialId: 'a' }],
      models: [
        { name: 'ok', target: 'm-a' },
        { name: 'alias', target: 'private-b' },
      ],
    };
    const issues = groupIssues(group, [credential]);
    expect(keys(issues, true)).toEqual([]);
    expect(issues).toEqual([
      {
        key: 'modelUnsupported',
        tab: 'models',
        blocking: false,
        params: { row: 2, model: 'private-b' },
        modelIndex: 1,
        modelField: 'target',
      },
    ]);
  });
  test('each invalid model row is reported with its row and the reason', () => {
    const group = {
      ...newGroup(),
      name: 'A',
      members: [{ credentialId: 'a' }],
      models: [
        { name: 'same', target: 'm-a' },
        { name: '  ', target: 'm-a' },
        { name: 'same', target: 'm-a' },
        { name: 'auto', target: 'm-a' },
        { name: 'no-target', target: '' },
      ],
    };
    const issues = groupIssues(group, [credential]).filter((issue) => issue.blocking);
    expect(
      issues.map((issue) => [issue.key, issue.params, issue.modelIndex, issue.modelField])
    ).toEqual([
      ['modelNameEmpty', { row: 2 }, 1, 'name'],
      ['modelNameDuplicate', { row: 3, name: 'same', other: 1 }, 2, 'name'],
      ['modelNameAuto', { row: 4 }, 3, 'name'],
      ['modelTargetEmpty', { row: 5 }, 4, 'target'],
    ]);
  });
  test('allows intentional sharing and names the member or field that is wrong', () => {
    const g = {
      ...newGroup(),
      name: 'A',
      enabled: true,
      members: [{ credentialId: 'a' }],
      models: [{ name: 'alias', target: 'm-a' }],
    };
    expect(groupIssues(g, [credential])).toEqual([]);
    expect(groupIssues(g, []).find((issue) => issue.key === 'missingMember')).toMatchObject({
      blocking: true,
      tab: 'members',
      params: { name: 'a' },
    });
    expect(
      groupIssues({ ...g, members: [{ credentialId: 'a', weight: -1 }] }, [credential])
    ).toMatchObject([{ key: 'invalidWeight', params: { name: 'Account A' }, credentialId: 'a' }]);
    expect(groupIssues({ ...g, maxConcurrent: -1 }, [credential])).toMatchObject([
      { key: 'invalidLimit', tab: 'policy', blocking: true, field: 'maxConcurrent' },
    ]);
    expect(groupIssues({ ...g, name: ' ' }, [credential])).toMatchObject([
      { key: 'nameRequired', tab: 'overview', blocking: true, field: 'name' },
    ]);
  });
  test('target choices come from the whole pool so models can precede their accounts', () => {
    expect(
      poolModels([
        credential,
        { ...credential, id: 'b', models: ['m-b', 'm-a', 'auto'] },
        { ...credential, id: 'c', conflict: true, models: ['m-conflict'] },
      ])
    ).toEqual(['m-a', 'm-b']);
  });
  test('preserves cooldown reasons and retry time independently from model permission', () => {
    const board = normalizeGroupBoard({
      version: 12,
      mode: 'grouped',
      groups: [],
      credentials: [credential],
      statuses: {
        a: [
          {
            name: 'public',
            supported: 2,
            available: 0,
            cooling: 2,
            cooldown_503: 1,
            retry_at: '2026-11-09T01:00:00Z',
          },
        ],
      },
    });
    expect(board.version).toBe(12);
    expect(board.statuses.a[0]).toEqual({
      name: 'public',
      supported: 2,
      available: 0,
      cooling: 2,
      cooldown503: 1,
      retryAt: '2026-11-09T01:00:00Z',
    });
  });
  test('writes cannot send key material or change server-owned key bindings', () => {
    const g = normalizeGroup({
      id: 'g',
      name: ' A ',
      key: 'SECRET',
      key_id: 'key-a',
      key_version: 4,
      policy: {},
      members: [],
      models: [],
    });
    const json = JSON.stringify(serializeGroup(g));
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('key_id');
    expect(json).not.toContain('key_version');
    expect(serializeGroup(g).name).toBe('A');
  });
  test('all supported languages contain the complete feature dictionary', () => {
    const keys = Object.keys(en.service_groups).sort();
    for (const locale of [zhCN, zhTW, ru, vi, ko, tr])
      expect(Object.keys(locale.service_groups).sort()).toEqual(keys);
  });
});
