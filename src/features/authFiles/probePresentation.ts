import type { CodexDegradationProbeStatus } from '@/services/api/codexDegradationProbe';

/** Keep the detector verdict separate from the scheduler hold it actually applied. */
export function getProbePresentation(
  status: CodexDegradationProbeStatus | undefined,
  mode: string | undefined,
  enabled: boolean | undefined,
  now: number
) {
  const holdActive = status?.hold_applied === true && Date.parse(status.held_until ?? '') > now;
  const failed = Boolean(status?.last_error?.trim());
  const suspected = status?.state === 'held' || status?.state === 'suspect';
  const stateKey = failed
    ? 'probe_failed'
    : suspected
      ? 'probe_suspected_degradation'
      : `probe_state_${status?.state ?? ''}`;
  const actionKey = holdActive
    ? 'probe_state_held'
    : mode === 'shadow' && enabled !== false
      ? 'probe_observation_not_paused'
      : 'probe_not_paused';
  const tone = holdActive
    ? 'danger'
    : failed || suspected || status?.state === 'recovering' || status?.last_verdict === 'abnormal'
      ? 'warn'
      : 'ok';
  return { holdActive, failed, stateKey, actionKey, tone };
}
