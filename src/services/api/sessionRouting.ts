import { apiClient } from './client';

export const sessionRoutingFields = {
  maxActiveSessions: 'max_active_sessions',
  maxConcurrentRequests: 'max_concurrent_requests',
  idleTtlSeconds: 'idle_ttl_seconds',
  failoverTtlSeconds: 'failover_ttl_seconds',
  baseRpm: 'base_rpm',
  rpmStickyBuffer: 'rpm_sticky_buffer',
} as const;
export type SessionRoutingField = keyof typeof sessionRoutingFields;
export type SessionRoutingValues = Record<SessionRoutingField, number>;

export const rpmStrategies = ['tiered', 'sticky_exempt'] as const;
export type RpmStrategy = (typeof rpmStrategies)[number];

export type SessionRoutingOverrides = Partial<SessionRoutingValues> & { rpmStrategy?: RpmStrategy };
export interface SessionRoutingSnapshot {
  overrides: SessionRoutingOverrides;
  defaults: SessionRoutingValues & { rpmStrategy: RpmStrategy };
  effective: SessionRoutingValues & { rpmStrategy: RpmStrategy };
  activeSessions: number;
  concurrentRequests: number;
  /** Successful requests in the current clock minute. */
  currentRpm: number;
  /** The sticky buffer in use: configured, or derived when configured as 0. */
  rpmStickyBufferEffective: number;
  failoverEnabled: boolean;
  editable: boolean;
  observedAt: string;
}

// Backends without account RPM omit these; they mean "no limit" rather than an
// invalid response, so the page keeps working against an older server.
const rpmKeys = new Set<string>(['base_rpm', 'rpm_sticky_buffer']);

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
function strategy(raw: unknown): RpmStrategy {
  if (raw === undefined) return 'tiered';
  if (typeof raw !== 'string' || !rpmStrategies.includes(raw as RpmStrategy)) {
    throw new Error('Invalid session routing strategy');
  }
  return raw as RpmStrategy;
}
function values(raw: unknown): SessionRoutingValues & { rpmStrategy: RpmStrategy } {
  const data = record(raw);
  return {
    ...(Object.fromEntries(
      Object.entries(sessionRoutingFields).map(([field, key]) => [
        field,
        data[key] === undefined && rpmKeys.has(key) ? 0 : number(data[key]),
      ])
    ) as SessionRoutingValues),
    rpmStrategy: strategy(data.rpm_strategy),
  };
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
    overrides: {
      ...Object.fromEntries(
        Object.entries(sessionRoutingFields)
          .filter(([, key]) => overrides[key] != null)
          .map(([field, key]) => [field, number(overrides[key])])
      ),
      ...(overrides.rpm_strategy != null ? { rpmStrategy: strategy(overrides.rpm_strategy) } : {}),
    },
    defaults: values(data.defaults),
    effective: values(data.effective),
    activeSessions: number(data.active_sessions),
    concurrentRequests: number(data.concurrent_requests),
    currentRpm: data.current_rpm === undefined ? 0 : number(data.current_rpm),
    rpmStickyBufferEffective:
      data.rpm_sticky_buffer_effective === undefined ? 0 : number(data.rpm_sticky_buffer_effective),
    editable: data.editable,
    failoverEnabled: data.failover_enabled,
    observedAt: data.observed_at,
  };
}
export function serializeSessionRouting(values: SessionRoutingOverrides) {
  return {
    ...Object.fromEntries(
      Object.entries(sessionRoutingFields)
        .filter(([field]) => values[field as SessionRoutingField] !== undefined)
        .map(([field, key]) => [key, values[field as SessionRoutingField]])
    ),
    ...(values.rpmStrategy !== undefined ? { rpm_strategy: values.rpmStrategy } : {}),
  };
}

export function normalizeSessionRoutingStatus(
  raw: unknown
): Record<string, SessionRoutingSnapshot | null> {
  const accounts = record(record(raw).accounts);
  return Object.fromEntries(
    Object.entries(accounts).map(([index, value]) => [
      index,
      value === null ? null : normalizeSessionRouting(value),
    ])
  );
}

// Pin credentials so an in-flight editor never writes to a newly selected server.
export function captureSessionRoutingApi() {
  const revision = apiClient.getConnectionRevision();
  const client = apiClient.captureConnection();
  return {
    isCurrent: () => apiClient.getConnectionRevision() === revision,
    getStatus: async (indices: string[], signal: AbortSignal) => {
      if (apiClient.getConnectionRevision() !== revision) throw new Error('Connection changed');
      return normalizeSessionRoutingStatus(
        await client.get('/credentials/session-routing/status', {
          params: { auth_indices: indices.join(',') },
          signal,
        })
      );
    },
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
