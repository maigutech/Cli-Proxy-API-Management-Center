import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Button } from '@/components/ui/Button';
import type {
  CodexDegradationProbeSettings,
  CodexDegradationProbeSettingsUpdate,
} from '@/services/api/codexDegradationProbe';

export interface CodexProbeSettingsDialogProps {
  open: boolean;
  settings: CodexDegradationProbeSettings;
  /** Models the fingerprint has a reference profile for. */
  availableModels: string[];
  onSave: (update: CodexDegradationProbeSettingsUpdate) => Promise<boolean>;
  onClose: () => void;
}

export function CodexProbeSettingsDialog({
  open,
  settings,
  availableModels,
  onSave,
  onClose,
}: CodexProbeSettingsDialogProps) {
  const { t } = useTranslation();
  const intervalId = useId();
  const modelId = useId();
  const [enabled, setEnabled] = useState(false);
  const [interval, setInterval] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed from the server every time the dialog opens so it never shows a
  // stale draft next to values another operator has since changed.
  useEffect(() => {
    if (!open) return;
    setEnabled(settings.enabled === true);
    setInterval(String(settings['interval-minutes'] ?? ''));
    setModel(settings['probe-model'] ?? '');
  }, [open, settings]);

  const modelOptions = availableModels.map((value) => ({ value, label: value }));
  const intervalValue = Number(interval);
  const intervalInvalid = interval.trim() !== '' && (!Number.isFinite(intervalValue) || intervalValue < 0);

  const save = async () => {
    if (intervalInvalid) return;
    setSaving(true);
    const update: CodexDegradationProbeSettingsUpdate = { enabled };
    if (interval.trim() !== '') update.interval_minutes = Math.trunc(intervalValue);
    if (model.trim() !== '') update.probe_model = model.trim();
    const ok = await onSave(update);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} width={520} title={t('auth_files.probe_settings_title')}>
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
        </div>

        <div>
          <Button variant="primary" onClick={save} disabled={saving || intervalInvalid}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
