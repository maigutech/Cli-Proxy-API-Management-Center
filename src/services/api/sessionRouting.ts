import { apiClient } from './client';

export const sessionRoutingFields = {
  maxActiveSessions: 'max_active_sessions',
  maxConcurrentRequests: 'max_concurrent_requests',
  idleTtlSeconds: 'idle_ttl_seconds',
  failoverTtlSeconds: 'failover_ttl_seconds',
} as const;
export type SessionRoutingField = keyof typeof sessionRoutingFields;
export type SessionRoutingValues = Record<SessionRoutingField, number>;
export type SessionRoutingOverrides = Partial<SessionRoutingValues>;
export interface SessionRoutingSnapshot {
  overrides: SessionRoutingOverrides;
  defaults: SessionRoutingValues;
  effective: SessionRoutingValues;
  activeSessions: number;
  concurrentRequests: number;
  failoverEnabled: boolean;
  editable: boolean;
  observedAt: string;
}

function record(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid session routing response');
  }
  return raw as Record<string, unknown>;
}
function number(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    throw new Error('Invalid session routing number');
  }
  return raw;
}
function values(raw: unknown): SessionRoutingValues {
  const data = record(raw);
  return Object.fromEntries(
    Object.entries(sessionRoutingFields).map(([field, key]) => [field, number(data[key])])
  ) as SessionRoutingValues;
}
export function normalizeSessionRouting(raw: unknown): SessionRoutingSnapshot {
  const data = record(raw);
  const overrides = record(data.overrides);
  if (
    typeof data.editable !== 'boolean' ||
    typeof data.failover_enabled !== 'boolean' ||
    typeof data.observed_at !== 'string'
  ) {
    throw new Error('Invalid session routing response');
  }
  return {
    overrides: Object.fromEntries(
      Object.entries(sessionRoutingFields)
        .filter(([, key]) => overrides[key] != null)
        .map(([field, key]) => [field, number(overrides[key])])
    ),
    defaults: values(data.defaults),
    effective: values(data.effective),
    activeSessions: number(data.active_sessions),
    concurrentRequests: number(data.concurrent_requests),
    editable: data.editable,
    failoverEnabled: data.failover_enabled,
    observedAt: data.observed_at,
  };
}
export function serializeSessionRouting(values: SessionRoutingOverrides) {
  return Object.fromEntries(
    Object.entries(sessionRoutingFields)
      .filter(([field]) => values[field as SessionRoutingField] !== undefined)
      .map(([field, key]) => [key, values[field as SessionRoutingField]])
  );
}

// Pin credentials so an in-flight editor never writes to a newly selected server.
export function captureSessionRoutingApi() {
  const revision = apiClient.getConnectionRevision();
  const client = apiClient.captureConnection();
  return {
    isCurrent: () => apiClient.getConnectionRevision() === revision,
    get: async (name: string, authIndex?: string) =>
      normalizeSessionRouting(
        await client.get('/credentials/session-routing', {
          params: { name, auth_index: authIndex },
        })
      ),
    save: async (name: string, overrides: SessionRoutingOverrides, authIndex?: string) =>
      normalizeSessionRouting(
        await client.put('/credentials/session-routing', {
          name,
          auth_index: authIndex,
          overrides: serializeSessionRouting(overrides),
        })
      ),
  };
}
