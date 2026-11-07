import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import {
  captureSessionRoutingApi,
  type SessionRoutingSnapshot,
} from '@/services/api/sessionRouting';
import { AUTH_FILES_CHANGED_EVENT } from '../authFilesEvents';

// One cancellable poll for the visible page; never one request per card.
export function useSessionRoutingStatus(indicesKey: string, enabled: boolean) {
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const revision = apiClient.getConnectionRevision();
  const [state, setState] = useState<{
    key: string;
    revision: number;
    accounts: Record<string, SessionRoutingSnapshot | null>;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !indicesKey) return;
    const api = captureSessionRoutingApi();
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
      request = new AbortController();
      try {
        const accounts = await api.getStatus(indicesKey.split(','), request.signal);
        if (active && api.isCurrent() && epoch === version) {
          setState({ key: indicesKey, revision, accounts });
        }
      } catch {
        if (active && api.isCurrent() && epoch === version) {
          setState({ key: indicesKey, revision, accounts: {} });
        }
      } finally {
        if (active && api.isCurrent() && epoch === version) {
          timer = setTimeout(() => void load(), 5000);
        }
      }
    };
    const refresh = () => {
      void load();
    };
    const visibility = () => {
      if (document.hidden) stop();
      else {
        setState(null);
        void load();
      }
    };
    void load();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener(AUTH_FILES_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      stop();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener(AUTH_FILES_CHANGED_EVENT, refresh);
    };
  }, [indicesKey, enabled, apiBase, managementKey, revision]);

  return enabled && state?.key === indicesKey && state.revision === revision ? state.accounts : {};
}
