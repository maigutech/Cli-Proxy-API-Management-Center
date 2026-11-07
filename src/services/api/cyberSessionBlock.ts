/**
 * Codex cyber-policy session-block API.
 *
 * Reads the block settings and the per-session block table from the server, and
 * writes the settings back via a deep-merged config patch. The block protects
 * the account pool: a downstream session that trips OpenAI's cyber-policy is
 * temporarily refused locally so it cannot keep hammering accounts.
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

export interface CyberSessionBlockSettings {
  enabled: boolean;
  ttlMinutes: number;
  threshold: number;
}

export interface CyberBlockedSession {
  sessionId: string;
  hits: number;
  blocked: boolean;
  lastCode?: string;
  lastMessage?: string;
  firstHitAt?: string;
  lastHitAt?: string;
  blockedAt?: string;
  expiresAt?: string;
}

export interface CyberSessionBlockView {
  settings: CyberSessionBlockSettings;
  sessions: CyberBlockedSession[];
}

const DEFAULT_SETTINGS: CyberSessionBlockSettings = { enabled: false, ttlMinutes: 30, threshold: 1 };

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function normalize(raw: unknown): CyberSessionBlockView {
  if (!isRecord(raw)) return { settings: DEFAULT_SETTINGS, sessions: [] };
  const s = isRecord(raw.settings) ? raw.settings : {};
  const settings: CyberSessionBlockSettings = {
    enabled: s.enabled === true,
    ttlMinutes: num(s['ttl-minutes'], DEFAULT_SETTINGS.ttlMinutes),
    threshold: num(s.threshold, DEFAULT_SETTINGS.threshold),
  };
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.filter(isRecord).map(
        (row): CyberBlockedSession => ({
          sessionId: str(row.session_id) ?? '',
          hits: num(row.hits, 0),
          blocked: row.blocked === true,
          lastCode: str(row.last_code),
          lastMessage: str(row.last_message),
          firstHitAt: str(row.first_hit_at),
          lastHitAt: str(row.last_hit_at),
          blockedAt: str(row.blocked_at),
          expiresAt: str(row.expires_at),
        })
      )
    : [];
  return { settings, sessions };
}

export const cyberSessionBlockApi = {
  /** Fetch block settings + the per-session block table. Empty/disabled on error. */
  get: async (): Promise<CyberSessionBlockView> => {
    try {
      const raw = await apiClient.get<unknown>('/routing/cyber-session-block');
      return normalize(raw);
    } catch {
      return { settings: DEFAULT_SETTINGS, sessions: [] };
    }
  },

  /** Write settings via a deep-merged config patch (server merges nested YAML). */
  updateSettings: (settings: CyberSessionBlockSettings) =>
    apiClient.patch('/config', {
      codex: {
        'cyber-session-block': {
          enabled: settings.enabled,
          'ttl-minutes': settings.ttlMinutes,
          threshold: settings.threshold,
        },
      },
    }),
};
