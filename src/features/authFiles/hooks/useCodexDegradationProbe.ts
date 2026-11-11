import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  codexDegradationProbeApi,
  type CodexDegradationProbeSettings,
  type CodexDegradationProbeSettingsUpdate,
  type CodexDegradationProbeStatus,
} from '@/services/api/codexDegradationProbe';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';

const PROBE_POLL_MS = 60_000;
const RUNNING_POLL_MS = 2_000;

type ProbeSession = {
  active: boolean;
  revision: number;
  pending: Set<string>;
  load: () => Promise<void>;
};

function buildIndex(credentials: CodexDegradationProbeStatus[]) {
  const map = new Map<string, CodexDegradationProbeStatus>();
  credentials.forEach((status) => {
    const index = String(status.auth_index ?? '').trim();
    if (index) map.set(index, status);
    const id = String(status.auth_id ?? '').trim();
    if (id && !map.has(id)) map.set(id, status);
  });
  return map;
}

/** Poll quickly while a check runs, preserving results on transient read errors. */
export function useCodexDegradationProbe() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const [settings, setSettings] = useState<CodexDegradationProbeSettings>({ enabled: false });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<CodexDegradationProbeStatus[]>([]);
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());
  const sessionRef = useRef<ProbeSession | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sequence = 0;
    let running = false;
    const session: ProbeSession = {
      active: true,
      revision: apiClient.getConnectionRevision(),
      pending: new Set(),
      load: async () => {
        const request = ++sequence;
        clearTimeout(timer);
        try {
          const result = await codexDegradationProbeApi.get();
          if (!current() || request !== sequence) return;
          setSettings(result.settings);
          setAvailableModels(result.availableModels);
          setCredentials(result.credentials);
          running = result.credentials.some((status) => status.in_flight);
        } catch {
          // Keep the last result; an unavailable status route is not a verdict.
        } finally {
          if (current() && request === sequence) {
            timer = setTimeout(
              () => void session.load(),
              running || session.pending.size ? RUNNING_POLL_MS : PROBE_POLL_MS
            );
          }
        }
      },
    };
    const current = () => session.active && session.revision === apiClient.getConnectionRevision();
    sessionRef.current = session;
    setSettings({ enabled: false });
    setCredentials([]);
    setSubmitting(new Set());
    if (authenticated) void session.load();
    return () => {
      session.active = false;
      clearTimeout(timer);
    };
  }, [apiBase, managementKey, authenticated]);

  const run = useCallback(
    async (authIndex: string) => {
      const session = sessionRef.current;
      if (!authIndex || !session?.active || session.pending.has(authIndex)) return;
      const current = () =>
        session.active && session.revision === apiClient.getConnectionRevision();
      if (!current()) return;
      session.pending.add(authIndex);
      setSubmitting(new Set(session.pending));
      try {
        await codexDegradationProbeApi.run(authIndex);
        if (current()) await session.load();
      } catch (error) {
        if (current()) {
          const status = (error as { status?: number })?.status;
          const messageKey =
            status === 429
              ? 'probe_busy'
              : status === 409
                ? 'probe_ineligible'
                : status === 503 || status === 404
                  ? 'probe_unavailable'
                  : 'probe_start_failed';
          showNotification(t(`auth_files.${messageKey}`), 'error');
        }
      } finally {
        session.pending.delete(authIndex);
        if (current()) setSubmitting(new Set(session.pending));
      }
    },
    [showNotification, t]
  );

  // Saving reloads the server's running config, so the change applies without a
  // restart; reload the status afterwards so the UI shows what is now in force.
  const updateSettings = useCallback(
    async (update: CodexDegradationProbeSettingsUpdate): Promise<boolean> => {
      try {
        await codexDegradationProbeApi.updateSettings(update);
        await sessionRef.current?.load();
        showNotification(t('auth_files.probe_settings_saved'), 'success');
        return true;
      } catch (error) {
        const message = (error as { message?: string })?.message;
        showNotification(
          message
            ? `${t('auth_files.probe_settings_failed')}: ${message}`
            : t('auth_files.probe_settings_failed'),
          'error'
        );
        return false;
      }
    },
    [showNotification, t]
  );

  const byAuth = useMemo(() => buildIndex(credentials), [credentials]);
  return {
    settings,
    availableModels,
    byAuth,
    hasData: credentials.length > 0,
    submitting,
    run,
    updateSettings,
  };
}
