/** Codex account quality probe status and manual checks. */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** Probe lifecycle state for one credential (backend: CodexProbeState*). */
export type CodexProbeState = 'clear' | 'suspect' | 'held' | 'recovering' | string;

/** Last classification of a probe check (backend: perfprobe.Verdict). */
export type CodexProbeVerdict = 'healthy' | 'abnormal' | 'inconclusive' | string;

export interface CodexDegradationProbeStatus {
  auth_id: string;
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
}

export interface CodexDegradationProbeResponse {
  settings: CodexDegradationProbeSettings;
  credentials: CodexDegradationProbeStatus[];
  /** Models the fingerprint has a reference profile for. A model outside this
   * list can never be the top candidate, so it is not offerable as a target. */
  availableModels: string[];
}

/** The fields an operator may change; the rest stay as configured. */
export interface CodexDegradationProbeSettingsUpdate {
  enabled?: boolean;
  interval_minutes?: number;
  probe_model?: string;
}

const EMPTY_RESPONSE: CodexDegradationProbeResponse = {
  settings: { enabled: false },
  credentials: [],
  availableModels: [],
};

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
  return { settings, credentials, availableModels };
}

export const codexDegradationProbeApi = {
  get: async (): Promise<CodexDegradationProbeResponse> =>
    normalizeResponse(await apiClient.get<unknown>('/routing/codex-degradation-probe')),
  run: async (authIndex: string): Promise<{ started: boolean }> =>
    apiClient.post('/routing/codex-degradation-probe', { auth_index: authIndex }),
  updateSettings: async (update: CodexDegradationProbeSettingsUpdate): Promise<void> =>
    apiClient.put('/routing/codex-degradation-probe/settings', update),
};
