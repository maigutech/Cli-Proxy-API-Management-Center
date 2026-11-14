/** Codex account quality probe status and manual checks. */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** Probe lifecycle state for one credential (backend: CodexProbeState*). */
export type CodexProbeState = 'clear' | 'suspect' | 'held' | 'recovering' | string;

/** Last classification of a probe check (backend: perfprobe.Verdict). */
export type CodexProbeVerdict = 'healthy' | 'abnormal' | 'inconclusive' | string;

export interface CodexDegradationProbeStatus {
  auth_id: string;
  /** Service identity; the degradation policy keys its records by this. */
  credential_id?: string;
  auth_index?: string;
  label?: string;
  state: CodexProbeState;
  last_verdict?: CodexProbeVerdict;
  last_top_probability?: number;
  last_replies?: number;
  consecutive_abnormal?: number;
  consecutive_healthy?: number;
  since?: string;
  last_checked_at?: string;
  next_check_at?: string;
  held_until?: string;
  hold_applied?: boolean;
  last_error?: string;
  in_flight?: boolean;
}

export interface CodexDegradationProbeSettings {
  enabled: boolean;
  /** "shadow" (record only) or "enforce" (hold degraded credentials). */
  mode?: string;
  'interval-minutes'?: number;
  'recheck-minutes'?: number;
  'max-concurrent-checks'?: number;
  'max-held-ratio'?: number;
  'healthy-probability'?: number;
  'abnormal-probability'?: number;
  /** Model each check requests. The verdict only means "the replies did (not)
   * look like this model", so it must be one of availableModels. */
  'probe-model'?: string;
  /** Automatic moves of confirmed degraded credentials between service groups. */
  policy?: CodexDegradationPolicySettings;
}

/**
 * Degradation policy (backend config.CodexDegradationPolicyConfig). Periodic
 * checks only: a first abnormal verdict is rechecked after the confirm delay,
 * a confirmed credential leaves the managed groups for the degraded group in
 * the quiet window if the canaries are healthy, and returns after enough
 * healthy checks in a row.
 */
export interface CodexDegradationPolicySettings {
  enabled: boolean;
  'managed-groups'?: string[];
  'degraded-group'?: string;
  'canary-credentials'?: string[];
  'quiet-start-hour'?: number;
  'quiet-end-hour'?: number;
  timezone?: string;
  'confirm-delay-minutes'?: number;
  'recover-healthy-checks'?: number;
  'max-degraded-ratio'?: number;
  'min-remaining-accounts'?: number;
}

/** Policy state of one credential (backend servicegroups.DegradationRecord). */
export interface CodexDegradationRecord {
  tier: 'normal' | 'degraded' | string;
  pending_since?: string;
  confirmed_at?: string;
  demoted_at?: string;
  removed_groups?: string[];
  added_to_degraded?: boolean;
  healthy_streak?: number;
  locked?: boolean;
  last_verdict?: string;
  last_top_model?: string;
  last_probability?: number;
  last_checked_at?: string;
  last_skip_at?: string;
  last_skip_reason?: string;
}

export interface CodexDegradationAction {
  at: string;
  credential_id: string;
  action: string;
  reason?: string;
}

export interface CodexDegradationPolicyState {
  /** Keyed by credential ID. */
  records: Record<string, CodexDegradationRecord>;
  actions: CodexDegradationAction[];
}

export interface CodexDegradationProbeResponse {
  settings: CodexDegradationProbeSettings;
  credentials: CodexDegradationProbeStatus[];
  /** Models the fingerprint has a reference profile for. A model outside this
   * list can never be the top candidate, so it is not offerable as a target. */
  availableModels: string[];
  policyState: CodexDegradationPolicyState;
}

/** The fields an operator may change; the rest stay as configured. */
export interface CodexDegradationProbeSettingsUpdate {
  enabled?: boolean;
  interval_minutes?: number;
  probe_model?: string;
  policy?: CodexDegradationPolicySettings;
}

const emptyPolicyState = (): CodexDegradationPolicyState => ({ records: {}, actions: [] });

const EMPTY_RESPONSE: CodexDegradationProbeResponse = {
  settings: { enabled: false },
  credentials: [],
  availableModels: [],
  policyState: emptyPolicyState(),
};

export function normalizePolicyState(raw: unknown): CodexDegradationPolicyState {
  if (!isRecord(raw)) return emptyPolicyState();
  const records: Record<string, CodexDegradationRecord> = {};
  if (isRecord(raw.records)) {
    for (const [id, record] of Object.entries(raw.records)) {
      if (isRecord(record)) records[id] = record as unknown as CodexDegradationRecord;
    }
  }
  const actions = Array.isArray(raw.actions)
    ? (raw.actions.filter(isRecord) as unknown as CodexDegradationAction[])
    : [];
  return { records, actions };
}

function normalizeResponse(raw: unknown): CodexDegradationProbeResponse {
  if (!isRecord(raw)) return EMPTY_RESPONSE;
  const settings = isRecord(raw.settings)
    ? (raw.settings as unknown as CodexDegradationProbeSettings)
    : { enabled: false };
  const credentials = Array.isArray(raw.credentials)
    ? (raw.credentials.filter(isRecord) as unknown as CodexDegradationProbeStatus[])
    : [];
  const availableModels = Array.isArray(raw.available_models)
    ? raw.available_models.filter((model): model is string => typeof model === 'string')
    : [];
  return {
    settings,
    credentials,
    availableModels,
    policyState: normalizePolicyState(raw.policy_state),
  };
}

export const codexDegradationProbeApi = {
  get: async (): Promise<CodexDegradationProbeResponse> =>
    normalizeResponse(await apiClient.get<unknown>('/routing/codex-degradation-probe')),
  run: async (authIndex: string): Promise<{ started: boolean }> =>
    apiClient.post('/routing/codex-degradation-probe', { auth_index: authIndex }),
  updateSettings: async (update: CodexDegradationProbeSettingsUpdate): Promise<void> =>
    apiClient.put('/routing/codex-degradation-probe/settings', update),
  setPolicyLock: async (
    credentialId: string,
    locked: boolean
  ): Promise<CodexDegradationPolicyState> => {
    const response = await apiClient.put<unknown>('/routing/codex-degradation-probe/policy/lock', {
      credential_id: credentialId,
      locked,
    });
    return normalizePolicyState(isRecord(response) ? response.policy_state : undefined);
  },
};
