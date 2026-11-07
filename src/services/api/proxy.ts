/**
 * Proxy test API.
 *
 * Sends a proxy URL to the server, which makes one outbound request through it
 * and reports the exit IP / geo / ISP. Lets an operator verify the global
 * proxy-url and the per-account OAuth proxy actually exit where expected (e.g.
 * a Singapore residential IP) before committing an account to it.
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

export interface ProxyTestResult {
  ok: boolean;
  /** "proxy" when a proxy was used, "direct" when the field was empty. */
  mode?: string;
  exitIp?: string;
  country?: string;
  region?: string;
  city?: string;
  org?: string;
  timezone?: string;
  latencyMs?: number;
  error?: string;
}

function normalize(raw: unknown): ProxyTestResult {
  if (!isRecord(raw)) return { ok: false, error: 'invalid response' };
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
  return {
    ok: raw.ok === true,
    mode: str(raw.mode),
    exitIp: str(raw.exit_ip),
    country: str(raw.country),
    region: str(raw.region),
    city: str(raw.city),
    org: str(raw.org),
    timezone: str(raw.timezone),
    latencyMs: num(raw.latency_ms),
    error: str(raw.error),
  };
}

export const proxyApi = {
  /**
   * Test a proxy URL (empty = test the server's own direct egress). Resolves to
   * a result object; transport/HTTP failures are returned as { ok: false, error }
   * rather than thrown, so callers render them inline.
   */
  test: async (proxyUrl: string): Promise<ProxyTestResult> => {
    try {
      const raw = await apiClient.post<unknown>(
        '/proxy/test',
        { proxy_url: proxyUrl },
        { timeout: 20_000 }
      );
      return normalize(raw);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },
};
