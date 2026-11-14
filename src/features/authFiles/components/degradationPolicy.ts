import type {
  CodexDegradationPolicySettings,
  CodexDegradationRecord,
} from '@/services/api/codexDegradationProbe';
import type { GroupBoard } from '@/services/api/serviceGroups';

/** Every policy field, with the backend's defaults filled in. */
export interface PolicyDraft {
  enabled: boolean;
  managedGroups: string[];
  degradedGroup: string;
  canaryCredentials: string[];
  quietStartHour: number;
  quietEndHour: number;
  timezone: string;
  confirmDelayMinutes: number;
  recoverHealthyChecks: number;
  maxDegradedRatio: number;
  minRemainingAccounts: number;
}

export const DEFAULT_POLICY_TIMEZONE = 'Asia/Shanghai';
/** The probe interval that checks each account once a day. */
export const DAILY_PROBE_INTERVAL_MINUTES = 1440;

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function policyDraftFrom(settings: CodexDegradationPolicySettings | undefined): PolicyDraft {
  const p = settings ?? { enabled: false };
  return {
    enabled: p.enabled === true,
    managedGroups: [...(p['managed-groups'] ?? [])],
    degradedGroup: p['degraded-group'] ?? '',
    canaryCredentials: [...(p['canary-credentials'] ?? [])],
    quietStartHour: num(p['quiet-start-hour'], 2),
    quietEndHour: num(p['quiet-end-hour'], 6),
    timezone: p.timezone || DEFAULT_POLICY_TIMEZONE,
    confirmDelayMinutes: num(p['confirm-delay-minutes'], 30),
    recoverHealthyChecks: num(p['recover-healthy-checks'], 2),
    maxDegradedRatio: num(p['max-degraded-ratio'], 0.5),
    minRemainingAccounts: num(p['min-remaining-accounts'], 1),
  };
}

export function policySettingsFrom(draft: PolicyDraft): CodexDegradationPolicySettings {
  return {
    enabled: draft.enabled,
    'managed-groups': draft.managedGroups,
    'degraded-group': draft.degradedGroup,
    'canary-credentials': draft.canaryCredentials,
    'quiet-start-hour': draft.quietStartHour,
    'quiet-end-hour': draft.quietEndHour,
    timezone: draft.timezone.trim() || DEFAULT_POLICY_TIMEZONE,
    'confirm-delay-minutes': draft.confirmDelayMinutes,
    'recover-healthy-checks': draft.recoverHealthyChecks,
    'max-degraded-ratio': draft.maxDegradedRatio,
    'min-remaining-accounts': draft.minRemainingAccounts,
  };
}

const intIn = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;

/**
 * Message keys (under `auth_files`) for what would make the server refuse the
 * policy, so the dialog can say so before saving. The server checks the same.
 */
export function policyIssues(
  draft: PolicyDraft,
  probeEnabled: boolean,
  board: GroupBoard | null
): string[] {
  const issues: string[] = [];
  const groups = new Map((board?.groups ?? []).map((g) => [g.id, g]));
  if (!intIn(draft.quietStartHour, 0, 23) || !intIn(draft.quietEndHour, 0, 23))
    issues.push('policy_issue_quiet_hours');
  if (!intIn(draft.confirmDelayMinutes, 5, 1440)) issues.push('policy_issue_confirm_delay');
  if (!intIn(draft.recoverHealthyChecks, 1, 10)) issues.push('policy_issue_recover_checks');
  if (!(draft.maxDegradedRatio > 0 && draft.maxDegradedRatio <= 1))
    issues.push('policy_issue_ratio');
  if (!intIn(draft.minRemainingAccounts, 0, 100)) issues.push('policy_issue_min_remaining');
  if (draft.managedGroups.some((id) => !groups.has(id) || groups.get(id)?.archived))
    issues.push('policy_issue_missing_group');
  if (draft.degradedGroup && draft.managedGroups.includes(draft.degradedGroup))
    issues.push('policy_issue_degraded_is_managed');
  if (draft.enabled) {
    if (board?.mode !== 'grouped') issues.push('policy_issue_groups_inactive');
    if (!probeEnabled) issues.push('policy_issue_probe_off');
    if (!draft.managedGroups.length) issues.push('policy_issue_no_managed');
    if (!draft.canaryCredentials.length) issues.push('policy_issue_no_canary');
  }
  return issues;
}

/** The policy's word on one account, for its card; null when it has none. */
export type PolicyBadge =
  | 'policy_badge_degraded'
  | 'policy_badge_confirmed'
  | 'policy_badge_pending'
  | 'policy_badge_locked';

export function policyBadge(record: CodexDegradationRecord | undefined): PolicyBadge | null {
  if (!record) return null;
  if (record.tier === 'degraded') return 'policy_badge_degraded';
  if (record.confirmed_at) return 'policy_badge_confirmed';
  if (record.pending_since) return 'policy_badge_pending';
  if (record.locked) return 'policy_badge_locked';
  return null;
}
