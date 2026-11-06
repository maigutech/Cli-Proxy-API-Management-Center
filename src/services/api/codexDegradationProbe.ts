/**
 * Codex degradation-probe (降智探针) observability API.
 *
 * Read-only view of the server's per-account Codex answer-quality probe: its
 * settings and the latest verdict/state for each probed credential. Used only to
 * display probe results in the panel; it never changes probe behaviour.
 */

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
}

export interface CodexDegradationProbeResponse {
  settings: CodexDegradationProbeSettings;
  credentials: CodexDegradationProbeStatus[];
}

const EMPTY_RESPONSE: CodexDegradationProbeResponse = {
  settings: { enabled: false },
  credentials: [],
};

function normalizeResponse(raw: unknown): CodexDegradationProbeResponse {
  if (!isRecord(raw)) return EMPTY_RESPONSE;
  const settings = isRecord(raw.settings)
    ? (raw.settings as unknown as CodexDegradationProbeSettings)
    : { enabled: false };
  const credentials = Array.isArray(raw.credentials)
    ? (raw.credentials.filter(isRecord) as unknown as CodexDegradationProbeStatus[])
    : [];
  return { settings, credentials };
}

export const codexDegradationProbeApi = {
  /**
   * Fetch probe settings and per-credential state. Resolves to an empty,
   * disabled result on any error (older servers without the route, probe off),
   * so the caller can treat "no data" and "probe unavailable" the same way.
   */
  get: async (): Promise<CodexDegradationProbeResponse> => {
    try {
      const raw = await apiClient.get<unknown>('/routing/codex-degradation-probe');
      return normalizeResponse(raw);
    } catch {
      return EMPTY_RESPONSE;
    }
  },
};
