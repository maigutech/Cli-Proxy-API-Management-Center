import { useEffect, useMemo, useRef, useState } from 'react';
import {
  codexDegradationProbeApi,
  type CodexDegradationProbeSettings,
  type CodexDegradationProbeStatus,
} from '@/services/api/codexDegradationProbe';

/** How often the panel re-reads probe state. The probe itself runs on a
 * multi-hour cadence, so a light poll keeps the badge fresh without load. */
const PROBE_POLL_MS = 60_000;

export interface CodexDegradationProbeView {
  settings: CodexDegradationProbeSettings;
  /** Lookup keyed by both normalized auth_index and auth_id, so a card can
   * match on whichever identity it holds. */
  byAuth: Map<string, CodexDegradationProbeStatus>;
  /** True once a probed credential has been seen, i.e. the feature is live. */
  hasData: boolean;
}

function buildIndex(
  credentials: CodexDegradationProbeStatus[]
): Map<string, CodexDegradationProbeStatus> {
  const map = new Map<string, CodexDegradationProbeStatus>();
  credentials.forEach((status) => {
    const index = String(status.auth_index ?? '').trim();
    if (index) map.set(index, status);
    const id = String(status.auth_id ?? '').trim();
    // Do not let an auth_id overwrite a distinct entry already keyed by index.
    if (id && !map.has(id)) map.set(id, status);
  });
  return map;
}

/**
 * Polls the Codex degradation-probe status and exposes a per-account lookup for
 * the auth-file cards. Degrades silently when the route is absent or the probe
 * is off (the API layer maps those to an empty, disabled result).
 */
export function useCodexDegradationProbe(): CodexDegradationProbeView {
  const [settings, setSettings] = useState<CodexDegradationProbeSettings>({ enabled: false });
  const [credentials, setCredentials] = useState<CodexDegradationProbeStatus[]>([]);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      const result = await codexDegradationProbeApi.get();
      if (!activeRef.current) return;
      setSettings(result.settings);
      setCredentials(result.credentials);
    };

    void load();
    timer = setInterval(() => void load(), PROBE_POLL_MS);

    return () => {
      activeRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const byAuth = useMemo(() => buildIndex(credentials), [credentials]);

  return {
    settings,
    byAuth,
    hasData: credentials.length > 0,
  };
}
