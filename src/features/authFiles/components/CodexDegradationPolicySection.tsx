import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type {
  CodexDegradationPolicyState,
  CodexDegradationRecord,
} from '@/services/api/codexDegradationProbe';
import type { GroupBoard } from '@/services/api/serviceGroups';
import { formatDateTimeValue } from '@/utils/format';
import { DAILY_PROBE_INTERVAL_MINUTES, policyBadge, type PolicyDraft } from './degradationPolicy';
import styles from './CodexDegradationPolicySection.module.scss';

const RECENT_ACTIONS = 20;

export interface CodexDegradationPolicySectionProps {
  draft: PolicyDraft;
  onChange: (draft: PolicyDraft) => void;
  board: GroupBoard | null;
  intervalMinutes: string;
  onUseDailyInterval: () => void;
  issues: string[];
  policyState: CodexDegradationPolicyState;
  onLock: (credentialId: string, locked: boolean) => Promise<boolean>;
}

/**
 * Settings and state of the degradation policy: which groups it manages, where
 * degraded accounts go, the canaries that guard it, and what it has done.
 */
export function CodexDegradationPolicySection({
  draft,
  onChange,
  board,
  intervalMinutes,
  onUseDailyInterval,
  issues,
  policyState,
  onLock,
}: CodexDegradationPolicySectionProps) {
  const { t } = useTranslation();
  const degradedId = useId();
  const [locking, setLocking] = useState<string | null>(null);
  const set = (change: Partial<PolicyDraft>) => onChange({ ...draft, ...change });
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...list.filter((v) => v !== id), id] : list.filter((v) => v !== id);
  const numberInput = (value: string) => (value.trim() === '' ? NaN : Number(value));

  const grouped = board?.mode === 'grouped';
  const groups = (board?.groups ?? []).filter((g) => !g.archived);
  const groupName = (id: string) => board?.groups.find((g) => g.id === id)?.name ?? id;
  const credentials = (board?.credentials ?? []).filter(
    (c) => c.id && !c.conflict && c.provider.toLowerCase() === 'codex'
  );
  const credentialName = (id: string) => board?.credentials.find((c) => c.id === id)?.name ?? id;
  const daily = Number(intervalMinutes) === DAILY_PROBE_INTERVAL_MINUTES;

  const records = Object.entries(policyState.records).sort(([a], [b]) =>
    credentialName(a).localeCompare(credentialName(b))
  );
  const actions = policyState.actions.slice(-RECENT_ACTIONS).reverse();

  const recordSummary = (record: CodexDegradationRecord) => {
    const badge = policyBadge(record);
    const parts = [badge ? t(`auth_files.${badge}`) : t('auth_files.policy_badge_none')];
    if (record.tier === 'degraded' && record.removed_groups?.length)
      parts.push(
        t('auth_files.policy_left_groups', {
          groups: record.removed_groups.map(groupName).join(', '),
        })
      );
    if (record.tier === 'degraded')
      parts.push(
        t('auth_files.policy_healthy_streak', {
          count: record.healthy_streak ?? 0,
          need: draft.recoverHealthyChecks,
        })
      );
    if (record.confirmed_at && record.last_skip_reason)
      parts.push(t('auth_files.policy_waiting', { reason: record.last_skip_reason }));
    return parts.join(' · ');
  };

  const lock = async (credentialId: string, locked: boolean) => {
    setLocking(credentialId);
    await onLock(credentialId, locked);
    setLocking(null);
  };

  return (
    <section className={styles.section} aria-labelledby={`${degradedId}-title`}>
      <h3 id={`${degradedId}-title`} className={styles.title}>
        {t('auth_files.policy_title')}
      </h3>
      <p className="hint">{t('auth_files.policy_description')}</p>

      {!grouped && <div className="error-box">{t('auth_files.policy_groups_inactive')}</div>}

      {!daily && (
        <div className={styles.notice}>
          {t('auth_files.policy_daily_hint', { minutes: DAILY_PROBE_INTERVAL_MINUTES })}
          <Button variant="secondary" size="sm" onClick={onUseDailyInterval}>
            {t('auth_files.policy_use_daily')}
          </Button>
        </div>
      )}

      <div className="form-group">
        <label>{t('auth_files.policy_enabled')}</label>
        <ToggleSwitch
          checked={draft.enabled}
          onChange={(enabled) => set({ enabled })}
          ariaLabel={t('auth_files.policy_enabled')}
          disabled={!grouped}
        />
      </div>

      <fieldset className={styles.fieldset}>
        <legend>{t('auth_files.policy_managed_groups')}</legend>
        <p className="hint">{t('auth_files.policy_managed_groups_hint')}</p>
        <div className={styles.choices}>
          {groups
            .filter((g) => g.id !== draft.degradedGroup)
            .map((g) => (
              <label key={g.id} className={styles.choice}>
                <input
                  type="checkbox"
                  checked={draft.managedGroups.includes(g.id)}
                  onChange={(e) =>
                    set({ managedGroups: toggle(draft.managedGroups, g.id, e.target.checked) })
                  }
                />
                <span>
                  {g.name}
                  <small>
                    {' '}
                    · {t('auth_files.policy_group_members', { count: g.members.length })}
                  </small>
                </span>
              </label>
            ))}
        </div>
      </fieldset>

      <div className="form-group">
        <label htmlFor={degradedId}>{t('auth_files.policy_degraded_group')}</label>
        <Select
          id={degradedId}
          value={draft.degradedGroup}
          options={[
            { value: '', label: t('auth_files.policy_degraded_group_none') },
            ...groups
              .filter((g) => !draft.managedGroups.includes(g.id))
              .map((g) => ({ value: g.id, label: g.name })),
          ]}
          onChange={(degradedGroup) => set({ degradedGroup })}
          ariaLabel={t('auth_files.policy_degraded_group')}
          fullWidth
        />
        <div className="hint">{t('auth_files.policy_degraded_group_hint')}</div>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>{t('auth_files.policy_canaries')}</legend>
        <p className="hint">{t('auth_files.policy_canaries_hint')}</p>
        <div className={styles.choices}>
          {credentials.map((c) => (
            <label key={c.id} className={styles.choice}>
              <input
                type="checkbox"
                checked={draft.canaryCredentials.includes(c.id)}
                onChange={(e) =>
                  set({
                    canaryCredentials: toggle(draft.canaryCredentials, c.id, e.target.checked),
                  })
                }
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.grid}>
        <Input
          label={t('auth_files.policy_quiet_start')}
          type="number"
          min={0}
          max={23}
          value={Number.isNaN(draft.quietStartHour) ? '' : draft.quietStartHour}
          onChange={(e) => set({ quietStartHour: numberInput(e.target.value) })}
        />
        <Input
          label={t('auth_files.policy_quiet_end')}
          type="number"
          min={0}
          max={23}
          value={Number.isNaN(draft.quietEndHour) ? '' : draft.quietEndHour}
          onChange={(e) => set({ quietEndHour: numberInput(e.target.value) })}
        />
        <Input
          label={t('auth_files.policy_timezone')}
          value={draft.timezone}
          onChange={(e) => set({ timezone: e.target.value })}
        />
      </div>
      <p className="hint">{t('auth_files.policy_quiet_hint')}</p>

      <div className={styles.grid}>
        <Input
          label={t('auth_files.policy_confirm_delay')}
          type="number"
          min={5}
          max={1440}
          value={Number.isNaN(draft.confirmDelayMinutes) ? '' : draft.confirmDelayMinutes}
          onChange={(e) => set({ confirmDelayMinutes: numberInput(e.target.value) })}
        />
        <Input
          label={t('auth_files.policy_recover_checks')}
          type="number"
          min={1}
          max={10}
          value={Number.isNaN(draft.recoverHealthyChecks) ? '' : draft.recoverHealthyChecks}
          onChange={(e) => set({ recoverHealthyChecks: numberInput(e.target.value) })}
        />
        <Input
          label={t('auth_files.policy_max_ratio')}
          type="number"
          min={1}
          max={100}
          value={
            Number.isNaN(draft.maxDegradedRatio) ? '' : Math.round(draft.maxDegradedRatio * 100)
          }
          onChange={(e) => set({ maxDegradedRatio: numberInput(e.target.value) / 100 })}
        />
        <Input
          label={t('auth_files.policy_min_remaining')}
          type="number"
          min={0}
          max={100}
          value={Number.isNaN(draft.minRemainingAccounts) ? '' : draft.minRemainingAccounts}
          onChange={(e) => set({ minRemainingAccounts: numberInput(e.target.value) })}
        />
      </div>

      {issues.length > 0 && (
        <div className="error-box" role="alert">
          <ul className={styles.list}>
            {issues.map((key) => (
              <li key={key}>{t(`auth_files.${key}`)}</li>
            ))}
          </ul>
        </div>
      )}

      <h4 className={styles.subtitle}>{t('auth_files.policy_state_title')}</h4>
      {records.length === 0 ? (
        <p className="hint">{t('auth_files.policy_state_empty')}</p>
      ) : (
        <ul className={styles.records}>
          {records.map(([id, record]) => (
            <li key={id} className={styles.record}>
              <span>
                <strong>{credentialName(id)}</strong>
                <small>{recordSummary(record)}</small>
              </span>
              <Button
                variant="ghost"
                size="sm"
                loading={locking === id}
                onClick={() => void lock(id, !record.locked)}
              >
                {t(record.locked ? 'auth_files.policy_unlock' : 'auth_files.policy_lock')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <h4 className={styles.subtitle}>{t('auth_files.policy_actions_title')}</h4>
      {actions.length === 0 ? (
        <p className="hint">{t('auth_files.policy_actions_empty')}</p>
      ) : (
        <ul className={styles.actions}>
          {actions.map((a, index) => (
            <li key={`${a.at}-${index}`}>
              <time>{formatDateTimeValue(a.at)}</time>
              <strong>{credentialName(a.credential_id)}</strong>
              <span>{t(`auth_files.policy_action_${a.action}`, { defaultValue: a.action })}</span>
              {a.reason && <small>{a.reason}</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
