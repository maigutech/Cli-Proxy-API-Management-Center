import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getProbePresentation } from '../src/features/authFiles/probePresentation';
import type { CodexDegradationProbeStatus } from '../src/services/api/codexDegradationProbe';

const now = Date.parse('2026-11-09T07:00:00Z');
const held: CodexDegradationProbeStatus = {
  auth_id: 'fixture',
  state: 'held',
  last_verdict: 'abnormal',
  held_until: '2026-11-09T08:00:00Z',
  hold_applied: false,
};

describe('degradation probe assessment and scheduling status', () => {
  test('shadow detector held state is only a warning, without a scheduling pause', () => {
    expect(getProbePresentation(held, 'shadow', true, now)).toMatchObject({
      stateKey: 'probe_suspected_degradation',
      actionKey: 'probe_observation_not_paused',
      holdActive: false,
      tone: 'warn',
    });
  });

  test('enforcement skipped by the hold budget must not claim observation or pause', () => {
    expect(getProbePresentation(held, 'enforce', true, now)).toMatchObject({
      actionKey: 'probe_not_paused',
      holdActive: false,
      tone: 'warn',
    });
  });

  test('an applied, unexpired hold is shown even during recovery or after a mode switch', () => {
    for (const state of ['held', 'recovering']) {
      for (const mode of ['enforce', 'shadow']) {
        expect(
          getProbePresentation({ ...held, state, hold_applied: true }, mode, true, now)
        ).toMatchObject({ actionKey: 'probe_state_held', holdActive: true, tone: 'danger' });
      }
    }
  });

  test('a failed probe must not conceal an active pause', () => {
    expect(
      getProbePresentation(
        { ...held, hold_applied: true, last_error: 'probe failed' },
        'enforce',
        true,
        now
      )
    ).toMatchObject({ stateKey: 'probe_failed', actionKey: 'probe_state_held', tone: 'danger' });
  });

  test('missing, invalid, expired and exactly expired deadlines cannot report an active pause', () => {
    for (const held_until of [
      undefined,
      '',
      'invalid',
      '2026-11-09T06:59:59Z',
      '2026-11-09T07:00:00Z',
    ]) {
      expect(
        getProbePresentation({ ...held, hold_applied: true, held_until }, 'enforce', true, now)
      ).toMatchObject({ actionKey: 'probe_not_paused', holdActive: false, tone: 'warn' });
    }
  });

  test('advancing the shared clock expires the displayed hold without a new server response', () => {
    const status = { ...held, hold_applied: true };
    expect(getProbePresentation(status, 'enforce', true, now).holdActive).toBe(true);
    expect(getProbePresentation(status, 'enforce', true, now + 3_600_000).holdActive).toBe(false);
  });

  test('a disabled probe does not claim active observation', () => {
    expect(getProbePresentation(held, 'shadow', false, now).actionKey).toBe('probe_not_paused');
  });

  test('unprobed and inconclusive checks cannot claim a healthy result', () => {
    expect(getProbePresentation(undefined, 'shadow', true, now)).toMatchObject({
      stateKey: 'probe_not_checked',
      tone: 'neutral',
    });
    expect(
      getProbePresentation({ auth_id: 'new', state: 'clear', in_flight: true }, 'shadow', true, now)
    ).toMatchObject({
      stateKey: 'probe_not_checked',
      tone: 'neutral',
    });
    expect(
      getProbePresentation(
        { auth_id: 'new', state: 'clear', last_verdict: 'inconclusive' },
        'shadow',
        true,
        now
      )
    ).toMatchObject({
      stateKey: 'probe_verdict_inconclusive',
      tone: 'neutral',
    });
  });

  test('healthy observations remain green', () => {
    expect(
      getProbePresentation(
        { auth_id: 'fixture', state: 'clear', last_verdict: 'healthy' },
        'shadow',
        true,
        now
      )
    ).toMatchObject({
      stateKey: 'probe_state_clear',
      actionKey: 'probe_observation_not_paused',
      tone: 'ok',
    });
  });

  test('all supported locales explain assessment and actual scheduling separately', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr']) {
      const messages = JSON.parse(
        readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
      ).auth_files;
      for (const key of [
        'probe_suspected_degradation',
        'probe_observation_not_paused',
        'probe_not_paused',
        'probe_assessment_hint',
        'probe_run',
        'probe_running',
        'probe_run_account',
        'probe_run_hint',
        'probe_not_checked',
        'probe_busy',
        'probe_ineligible',
        'probe_unavailable',
        'probe_start_failed',
      ]) {
        expect(messages[key]).toBeTruthy();
      }
    }
  });
});
