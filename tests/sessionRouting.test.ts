import { describe, expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import {
  normalizeSessionRouting,
  serializeSessionRouting,
} from '../src/services/api/sessionRouting';
import {
  routingDraft,
  routingOverrides,
  routingDirty,
  invalidRoutingFields,
} from '../src/features/authFiles/sessionRouting';
import { runVisualConfig } from './helpers/visualConfig';

describe('account session routing', () => {
  test('zero is unlimited while omission inherits; clearing restores inheritance', () => {
    const inherited = routingDraft({});
    expect(routingOverrides(inherited)).toEqual({});
    inherited.maxActiveSessions = { inherit: false, value: '0' };
    expect(routingOverrides(inherited)).toEqual({ maxActiveSessions: 0 });
    expect(routingDirty(inherited, {})).toBe(true);
    expect(serializeSessionRouting(routingOverrides(inherited))).toEqual({
      max_active_sessions: 0,
    });
    inherited.maxActiveSessions.inherit = true;
    expect(routingDirty(inherited, {})).toBe(false);
    expect(routingOverrides(inherited)).toEqual({});
  });
  test('invalid local values cannot be serialized or saved', () => {
    for (const value of ['-1', '1.5', '', '1e3', '1000001']) {
      const draft = routingDraft({});
      draft.maxConcurrentRequests = { inherit: false, value };
      expect(invalidRoutingFields(draft)).toContain('maxConcurrentRequests');
      expect(() => routingOverrides(draft)).toThrow();
    }
    const draft = routingDraft({ idleTtlSeconds: 0, failoverTtlSeconds: 0 });
    expect(invalidRoutingFields(draft)).toEqual(['idleTtlSeconds']);
  });
  test('normalizes snapshots and never fabricates occupancy on missing fields', () => {
    const values = {
      max_active_sessions: 10,
      max_concurrent_requests: 5,
      idle_ttl_seconds: 300,
      failover_ttl_seconds: 60,
    };
    const response = {
      overrides: { max_active_sessions: 0, idle_ttl_seconds: null },
      defaults: values,
      effective: { ...values, max_active_sessions: 0 },
      active_sessions: 3,
      concurrent_requests: 1,
      failover_enabled: true,
      editable: true,
      observed_at: '2026-11-07T00:00:00Z',
    };
    expect(normalizeSessionRouting(response)).toMatchObject({
      overrides: { maxActiveSessions: 0 },
      activeSessions: 3,
      concurrentRequests: 1,
      effective: { maxActiveSessions: 0, maxConcurrentRequests: 5 },
    });
    expect(() => normalizeSessionRouting({ ...response, active_sessions: undefined })).toThrow();
    expect(() => normalizeSessionRouting({ ...response, concurrent_requests: '1' })).toThrow();
  });
  test('global settings round trip through the visual editor while preserving other routing data', () => {
    const yaml =
      'routing:\n  session-affinity: true\n  strategy: round-robin\n  future: preserved\n';
    const config = runVisualConfig(yaml, [
      {
        routingMaxActiveSessions: '10',
        routingMaxConcurrentRequests: '5',
        routingSessionIdleTTL: '5m',
        routingSessionFailoverTTL: '2m',
        routingSessionRebindOn: 'quota',
      },
    ]);
    const saved = config.applyVisualChangesToYaml(yaml);
    expect(parseDocument(saved).toJS().routing).toMatchObject({
      'max-active-sessions-per-credential': 10,
      'max-concurrent-requests-per-credential': 5,
      'session-idle-ttl': '5m',
      'session-affinity-failover-ttl': '2m',
      'session-affinity-rebind-on': 'quota',
      future: 'preserved',
    });
    expect(runVisualConfig(saved).visualValues.routingMaxActiveSessions).toBe('10');
  });
});
