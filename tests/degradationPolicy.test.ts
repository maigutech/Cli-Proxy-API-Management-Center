import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { CodexDegradationPolicySection } from '@/features/authFiles/components/CodexDegradationPolicySection';
import {
  policyBadge,
  policyDraftFrom,
  policyIssues,
  policySettingsFrom,
} from '@/features/authFiles/components/degradationPolicy';
import { normalizePolicyState } from '@/services/api/codexDegradationProbe';
import type { GroupBoard } from '@/services/api/serviceGroups';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';
import vi from '@/i18n/locales/vi.json';
import ko from '@/i18n/locales/ko.json';
import tr from '@/i18n/locales/tr.json';

const group = (id: string, archived = false) => ({
  id,
  name: id,
  note: '',
  enabled: true,
  archived,
  members: [],
  models: [],
  maxConcurrent: 0,
  allowAuto: false,
  keyId: '',
  keyPrefix: '',
  keyVersion: 0,
  keyAvailable: false,
});
const board: GroupBoard = {
  version: 1,
  mode: 'grouped',
  groups: [group('customers'), group('degraded'), group('old', true)],
  credentials: [],
  statuses: {},
};

describe('degradation policy editor', () => {
  test('a missing policy gets the server defaults and survives a round trip', () => {
    const draft = policyDraftFrom(undefined);
    expect(draft).toMatchObject({
      enabled: false,
      quietStartHour: 2,
      quietEndHour: 6,
      timezone: 'Asia/Shanghai',
      confirmDelayMinutes: 30,
      recoverHealthyChecks: 2,
      maxDegradedRatio: 0.5,
      minRemainingAccounts: 1,
    });
    const configured = {
      ...draft,
      enabled: true,
      managedGroups: ['customers'],
      quietStartHour: 0,
      quietEndHour: 0,
    };
    expect(policyDraftFrom(policySettingsFrom(configured))).toEqual(configured);
  });

  test('says before saving what the server would refuse', () => {
    const ok = {
      ...policyDraftFrom(undefined),
      enabled: true,
      managedGroups: ['customers'],
      degradedGroup: 'degraded',
      canaryCredentials: ['cred-a'],
    };
    expect(policyIssues(ok, true, board)).toEqual([]);
    expect(policyIssues({ ...ok, canaryCredentials: [] }, true, board)).toEqual([
      'policy_issue_no_canary',
    ]);
    expect(policyIssues(ok, false, board)).toEqual(['policy_issue_probe_off']);
    expect(
      policyIssues({ ...ok, managedGroups: ['customers', 'degraded'] }, true, board)
    ).toContain('policy_issue_degraded_is_managed');
    expect(policyIssues({ ...ok, managedGroups: ['old'] }, true, board)).toContain(
      'policy_issue_missing_group'
    );
    expect(policyIssues({ ...ok, quietEndHour: 24 }, true, board)).toContain(
      'policy_issue_quiet_hours'
    );
    expect(policyIssues({ ...ok, maxDegradedRatio: 0 }, true, board)).toContain(
      'policy_issue_ratio'
    );
    expect(policyIssues(ok, true, { ...board, mode: 'legacy' })).toContain(
      'policy_issue_groups_inactive'
    );
    // A paused policy may be saved half configured.
    expect(
      policyIssues(
        { ...ok, enabled: false, managedGroups: [], canaryCredentials: [] },
        false,
        board
      )
    ).toEqual([]);
  });

  test('cards show the furthest stage an account has reached', () => {
    expect(policyBadge(undefined)).toBeNull();
    expect(policyBadge({ tier: 'normal', pending_since: 't' })).toBe('policy_badge_pending');
    expect(policyBadge({ tier: 'normal', pending_since: 't', confirmed_at: 't' })).toBe(
      'policy_badge_confirmed'
    );
    expect(policyBadge({ tier: 'degraded', locked: true })).toBe('policy_badge_degraded');
    expect(policyBadge({ tier: 'normal', locked: true })).toBe('policy_badge_locked');
  });

  test('policy state from the server tolerates missing parts', () => {
    expect(normalizePolicyState(undefined)).toEqual({ records: {}, actions: [] });
    expect(
      normalizePolicyState({
        records: { a: { tier: 'degraded' }, b: 'junk' },
        actions: [{ action: 'demote' }, 1],
      })
    ).toEqual({ records: { a: { tier: 'degraded' } }, actions: [{ action: 'demote' }] as never });
  });

  test('every language has every policy string', () => {
    const keys = Object.keys(en.auth_files)
      .filter((k) => k.startsWith('policy_'))
      .sort();
    expect(keys.length).toBeGreaterThan(40);
    for (const locale of [zhCN, zhTW, ru, vi, ko, tr])
      expect(
        Object.keys(locale.auth_files)
          .filter((k) => k.startsWith('policy_'))
          .sort()
      ).toEqual(keys);
  });
});

const translations = createInstance();
await translations.init({ lng: 'cimode', resources: {}, react: { useSuspense: false } });

describe('degradation policy section', () => {
  test('renders groups, canaries, the moved account and its history', () => {
    const withCredentials: GroupBoard = {
      ...board,
      groups: [
        { ...group('customers'), name: 'Customers' },
        { ...group('degraded'), name: '降智组' },
      ],
      credentials: [
        {
          id: 'cred-a',
          authId: 'a',
          name: 'alice@x',
          provider: 'codex',
          disabled: false,
          conflict: false,
          models: [],
          groups: [],
        },
        {
          id: 'cred-k',
          authId: 'k',
          name: 'claude-key',
          provider: 'claude',
          disabled: false,
          conflict: false,
          models: [],
          groups: [],
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n: translations },
        createElement(CodexDegradationPolicySection, {
          draft: {
            ...policyDraftFrom(undefined),
            managedGroups: ['customers'],
            degradedGroup: 'degraded',
          },
          onChange: () => {},
          board: withCredentials,
          intervalMinutes: '360',
          onUseDailyInterval: () => {},
          issues: ['policy_issue_no_canary'],
          policyState: {
            records: {
              'cred-a': { tier: 'degraded', removed_groups: ['customers'], healthy_streak: 1 },
            },
            actions: [
              {
                at: '2026-11-14T19:00:00Z',
                credential_id: 'cred-a',
                action: 'demote',
                reason: 'left Customers',
              },
            ],
          },
          onLock: async () => true,
        })
      )
    );
    expect(html).toContain('auth_files.policy_title');
    expect(html).toContain('auth_files.policy_daily_hint'); // interval is not daily
    expect(html).toContain('Customers');
    expect(html).toContain('alice@x');
    expect(html).not.toContain('claude-key'); // only Codex accounts can be canaries
    expect(html).toContain('auth_files.policy_issue_no_canary');
    expect(html).toContain('auth_files.policy_badge_degraded');
    expect(html).toContain('auth_files.policy_action_demote');
    expect(html).toContain('left Customers');
  });
});
