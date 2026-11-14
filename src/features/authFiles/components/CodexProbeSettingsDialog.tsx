import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Button } from '@/components/ui/Button';
import type {
  CodexDegradationPolicyState,
  CodexDegradationProbeSettings,
  CodexDegradationProbeSettingsUpdate,
} from '@/services/api/codexDegradationProbe';
import type { GroupBoard } from '@/services/api/serviceGroups';
import { CodexDegradationPolicySection } from './CodexDegradationPolicySection';
import {
  DAILY_PROBE_INTERVAL_MINUTES,
  policyDraftFrom,
  policyIssues,
  policySettingsFrom,
  type PolicyDraft,
} from './degradationPolicy';

/** Documented in the scorer as frequently mistaken for gpt-5.5 on healthy
 * accounts, so it is the one profile that should not be a probe target. */
const UNRELIABLE_PROBE_MODEL = 'gpt-6-sol';

export interface CodexProbeSettingsDialogProps {
  open: boolean;
  settings: CodexDegradationProbeSettings;
  /** Models the fingerprint has a reference profile for. */
  availableModels: string[];
  onSave: (update: CodexDegradationProbeSettingsUpdate) => Promise<boolean>;
  onClose: () => void;
  /** Service groups, for the degradation policy; null until loaded. */
  board?: GroupBoard | null;
  policyState?: CodexDegradationPolicyState;
  onPolicyLock?: (credentialId: string, locked: boolean) => Promise<boolean>;
}

export function CodexProbeSettingsDialog({
  open,
  settings,
  availableModels,
  onSave,
  onClose,
  board = null,
  policyState = { records: {}, actions: [] },
  onPolicyLock = async () => false,
}: CodexProbeSettingsDialogProps) {
  const { t } = useTranslation();
  const intervalId = useId();
  const modelId = useId();
  const [enabled, setEnabled] = useState(false);
  const [interval, setInterval] = useState('');
  const [model, setModel] = useState('');
  const [policy, setPolicy] = useState<PolicyDraft>(() => policyDraftFrom(undefined));
  const [saving, setSaving] = useState(false);

  // Re-seed from the server every time the dialog opens so it never shows a
  // stale draft next to values another operator has since changed.
  useEffect(() => {
    if (!open) return;
    setEnabled(settings.enabled === true);
    setInterval(String(settings['interval-minutes'] ?? ''));
    setModel(settings['probe-model'] ?? '');
    setPolicy(policyDraftFrom(settings.policy));
  }, [open, settings]);

  // gpt-6-sol has a reference profile, so the server accepts it, but it is
  // routinely mistaken for gpt-5.5 even on healthy accounts: picking it makes
  // the probe report degradation that is not there. Offer it, flagged.
  const modelOptions = availableModels.map((value) => ({
    value,
    label:
      value === UNRELIABLE_PROBE_MODEL
        ? `${value} — ${t('auth_files.probe_model_unreliable')}`
        : value,
  }));
  const modelUnreliable = model === UNRELIABLE_PROBE_MODEL;
  const intervalValue = Number(interval);
  const intervalInvalid =
    interval.trim() !== '' && (!Number.isFinite(intervalValue) || intervalValue < 0);
  const grouped = board?.mode === 'grouped';
  // The policy is only sent where service groups exist; without them there is
  // nothing for it to move and the server would refuse it.
  const issues = grouped ? policyIssues(policy, enabled, board) : [];

  const save = async () => {
    if (intervalInvalid || issues.length) return;
    setSaving(true);
    const update: CodexDegradationProbeSettingsUpdate = { enabled };
    if (interval.trim() !== '') update.interval_minutes = Math.trunc(intervalValue);
    if (model.trim() !== '') update.probe_model = model.trim();
    if (grouped) update.policy = policySettingsFrom(policy);
    const ok = await onSave(update);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} width={640} title={t('auth_files.probe_settings_title')}>
      <div className="stack">
        <p className="hint">{t('auth_files.probe_settings_description')}</p>

        <div className="form-group">
          <label>{t('auth_files.probe_settings_enabled')}</label>
          <ToggleSwitch
            checked={enabled}
            onChange={setEnabled}
            ariaLabel={t('auth_files.probe_settings_enabled')}
          />
          <div className="hint">{t('auth_files.probe_settings_enabled_hint')}</div>
        </div>

        <Input
          id={intervalId}
          label={t('auth_files.probe_settings_interval')}
          hint={t('auth_files.probe_settings_interval_hint')}
          value={interval}
          inputMode="numeric"
          onChange={(event) => setInterval(event.target.value)}
          error={intervalInvalid ? t('auth_files.probe_settings_interval_invalid') : undefined}
        />

        <div className="form-group">
          <label htmlFor={modelId}>{t('auth_files.probe_settings_model')}</label>
          <Select
            id={modelId}
            value={model}
            options={modelOptions}
            onChange={setModel}
            placeholder={t('auth_files.probe_settings_model_placeholder')}
            ariaLabel={t('auth_files.probe_settings_model')}
            fullWidth
          />
          <div className="hint">{t('auth_files.probe_settings_model_hint')}</div>
          {modelUnreliable && (
            <div className="error-box" role="alert">
              {t('auth_files.probe_model_unreliable_warning')}
            </div>
          )}
        </div>

        {grouped && (
          <CodexDegradationPolicySection
            draft={policy}
            onChange={setPolicy}
            board={board}
            intervalMinutes={interval}
            onUseDailyInterval={() => setInterval(String(DAILY_PROBE_INTERVAL_MINUTES))}
            issues={issues}
            policyState={policyState}
            onLock={onPolicyLock}
          />
        )}

        <div>
          <Button
            variant="primary"
            onClick={save}
            disabled={saving || intervalInvalid || issues.length > 0}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
