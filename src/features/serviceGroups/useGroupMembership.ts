import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/services/api/client';
import { captureServiceGroupsApi, type GroupBoard } from '@/services/api/serviceGroups';
import { useAuthStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import { groupMembership } from './membership';

export function useGroupMembership() {
  const apiBase = useAuthStore((s) => s.apiBase);
  const managementKey = useAuthStore((s) => s.managementKey);
  const connected = useAuthStore((s) => s.connectionStatus === 'connected');
  const [snapshot, setSnapshot] = useState<{ board: GroupBoard; revision: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const gen = ++generation.current;
    const revision = apiClient.getConnectionRevision();
    const current = () =>
      gen === generation.current && revision === apiClient.getConnectionRevision();
    if (!connected) return;
    setLoading(true);
    try {
      const next = await captureServiceGroupsApi().list();
      if (!current()) return;
      setSnapshot({ board: next, revision });
      setError('');
    } catch (cause) {
      if (!current()) return;
      setSnapshot(null);
      setError(getErrorMessage(cause));
    } finally {
      if (current()) setLoading(false);
    }
  }, [connected]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    setSnapshot(null);
    setSelected('');
    setError('');
    void reload();
    return invalidate;
  }, [apiBase, managementKey, connected, reload, invalidate]);
  const activeBoard =
    snapshot?.revision === apiClient.getConnectionRevision() ? snapshot.board : null;
  const membership = useMemo(() => groupMembership(activeBoard), [activeBoard]);
  return { board: activeBoard, membership, selected, setSelected, reload, error, loading };
}
