import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { captureUsageApi, type UsageAccounts } from '@/services/api/accountUsage';
import { AUTH_FILES_CHANGED_EVENT } from '@/features/authFiles/authFilesEvents';

export const USAGE_CHANGED = 'account-usage-changed';
export function notifyUsageChanged() {
  window.dispatchEvent(new Event(USAGE_CHANGED));
}

export function useAccountUsage(indicesKey: string, enabled: boolean) {
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const revision = apiClient.getConnectionRevision();
  const [state, setState] = useState<{
    key: string;
    revision: number;
    data: UsageAccounts | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!enabled || !indicesKey) return;
    const api = captureUsageApi();
    let active = true;
    let epoch = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const stop = () => {
      epoch++;
      clearTimeout(timer);
      request?.abort();
    };
    const load = async () => {
      stop();
      if (!active || document.hidden || !api.isCurrent()) return;
      const version = epoch;
      const controller = new AbortController();
      request = controller;
      try {
        const indices = indicesKey.split(',');
        let data: UsageAccounts | null = null;
        for (let offset = 0; offset < indices.length; offset += 200) {
          if (!active || version !== epoch || !api.isCurrent()) return;
          const chunk = await api.accounts(indices.slice(offset, offset + 200), controller.signal);
          if (data === null) data = chunk;
          else Object.assign(data.accounts, chunk.accounts);
        }
        if (active && api.isCurrent() && version === epoch)
          setState({ key: indicesKey, revision, data, error: '' });
      } catch (cause) {
        if (active && api.isCurrent() && version === epoch)
          setState({
            key: indicesKey,
            revision,
            data: null,
            error: cause instanceof Error ? cause.message : 'Usage unavailable',
          });
      } finally {
        if (active && api.isCurrent() && version === epoch)
          timer = setTimeout(() => void load(), 15000);
      }
    };
    const refresh = () => {
      void load();
    };
    const visible = () => {
      if (document.hidden) stop();
      else refresh();
    };
    refresh();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener(USAGE_CHANGED, refresh);
    window.addEventListener(AUTH_FILES_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      stop();
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener(USAGE_CHANGED, refresh);
      window.removeEventListener(AUTH_FILES_CHANGED_EVENT, refresh);
    };
  }, [indicesKey, enabled, apiBase, managementKey, revision]);
  return enabled && state?.key === indicesKey && state.revision === revision ? state : null;
}
