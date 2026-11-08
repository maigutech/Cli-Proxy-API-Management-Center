import { describe, expect, test } from 'bun:test';
import { normalizeGroupBoard, normalizeGroup, serializeGroup } from '@/services/api/serviceGroups';
import { newGroup, groupValidation, supportedModels } from '@/features/serviceGroups/logic';
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
  test('new groups start disabled with no accidental authorization', () => {
    expect(newGroup().enabled).toBe(false);
    expect(newGroup().models).toEqual([]);
    expect(groupValidation({ ...newGroup(), name: 'test', enabled: true }, [])).toBe(
      'emptyEnabled'
    );
  });
  test('model choices use only explicit members and exclude duplicate identities', () => {
    const group = { ...newGroup(), name: 'A', members: [{ credentialId: 'a' }] };
    expect(
      supportedModels(group, [credential, { ...credential, id: 'b', models: ['private-b'] }])
    ).toEqual(['m-a']);
    expect(supportedModels(group, [{ ...credential, conflict: true }])).toEqual([]);
    expect(
      groupValidation(
        { ...group, enabled: true, models: [{ name: 'alias', target: 'private-b' }] },
        [credential]
      )
    ).toBe('unsupportedModel');
  });
  test('allows intentional sharing and rejects missing members and bad limits', () => {
    const g = {
      ...newGroup(),
      name: 'A',
      enabled: true,
      members: [{ credentialId: 'a' }],
      models: [{ name: 'alias', target: 'm-a' }],
    };
    expect(groupValidation(g, [credential])).toBeNull();
    expect(groupValidation(g, [])).not.toBeNull();
    expect(groupValidation({ ...g, maxConcurrent: -1 }, [credential])).toBe('invalidLimit');
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
