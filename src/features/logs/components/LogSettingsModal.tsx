import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { captureUsageApi } from '@/services/api/accountUsage';
import { useAuthStore, useNotificationStore } from '@/stores';
import styles from './LogSettingsModal.module.scss';

export function LogSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { showConfirmation, showNotification } = useNotificationStore();
  const [api] = useState(captureUsageApi);
  useAuthStore((s) => s.apiBase);
  useAuthStore((s) => s.managementKey);
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const mounted = useRef(false);
  const pending = useRef(false);
  const formId = useId();
  const [retention, setRetention] = useState('');
  const [savedRetention, setSavedRetention] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const stale = !api.isCurrent() || connectionStatus !== 'connected';
  const busy = saving || confirming;
  const days = Number(retention);
  const valid = retention.trim() !== '' && Number.isInteger(days) && days >= 7 && days <= 3650;
  const dirty = savedRetention !== null && days !== savedRetention;
  const current = () =>
    mounted.current && api.isCurrent() && useAuthStore.getState().connectionStatus === 'connected';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (stale) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void api
      .status(controller.signal)
      .then((status) => {
        if (!active || !api.isCurrent()) return;
        if (
          !status.ready ||
          !Number.isInteger(status.retentionDays) ||
          status.retentionDays < 7 ||
          status.retentionDays > 3650
        ) {
          throw new Error(t('logs.retention_unavailable'));
        }
        setRetention(String(status.retentionDays));
        setSavedRetention(status.retentionDays);
      })
      .catch((cause: unknown) => {
        if (active && api.isCurrent())
          setError(cause instanceof Error ? cause.message : t('account_usage.loadFailed'));
      })
      .finally(() => {
        if (active && api.isCurrent()) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, revision, stale, t]);

  const save = async () => {
    if (pending.current || !current() || savedRetention === null || !valid || !dirty) return;
    pending.current = true;
    try {
      if (days < savedRetention) {
        setConfirming(true);
        const approved = await new Promise<boolean>((resolve) =>
          showConfirmation({
            title: t('account_usage.retention'),
            message: t('account_usage.retentionWarning'),
            variant: 'danger',
            confirmText: t('common.save'),
            cancelText: t('common.cancel'),
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
          })
        );
        if (!approved || !current()) return;
      }
      setSaving(true);
      setError('');
      const status = await api.retention(days);
      if (!current()) return;
      setSavedRetention(status.retentionDays);
      setRetention(String(status.retentionDays));
      showNotification(t('logs.retention_saved'), 'success');
    } catch (cause) {
      if (current())
        setError(cause instanceof Error ? cause.message : t('account_usage.saveFailed'));
    } finally {
      pending.current = false;
      if (mounted.current) {
        setSaving(false);
        setConfirming(false);
      }
    }
  };

  return (
    <Modal
      open
      title={t('logs.settings_title')}
      onClose={onClose}
      width={480}
      closeDisabled={busy && !stale}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy && !stale}>
            {t('common.close')}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={stale || loading || busy || !valid || !dirty}
            loading={saving}
          >
            {t('account_usage.saveRetention')}
          </Button>
        </>
      }
    >
      {stale ? (
        <p className="error-box" role="alert">
          {t('account_usage.connectionChanged')}
        </p>
      ) : (
        <form
          id={formId}
          className={styles.content}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className={styles.scope}>{t('logs.retention_scope')}</p>
          {loading ? (
            <div role="status">
              <LoadingSpinner /> {t('common.loading')}
            </div>
          ) : (
            savedRetention !== null && (
              <>
                <Input
                  label={t('account_usage.retention')}
                  type="number"
                  min={7}
                  max={3650}
                  step={1}
                  value={retention}
                  onChange={(event) => setRetention(event.target.value)}
                  disabled={busy}
                  hint={t('logs.retention_hint')}
                  error={!valid ? t('account_usage.invalidRetention') : undefined}
                />
                <div
                  className={styles.presets}
                  role="group"
                  aria-label={t('account_usage.retention')}
                >
                  {[7, 14, 30, 90].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={days === value ? 'primary' : 'secondary'}
                      aria-pressed={days === value}
                      disabled={busy}
                      onClick={() => setRetention(String(value))}
                    >
                      {t('logs.retention_preset', { days: value })}
                    </Button>
                  ))}
                </div>
              </>
            )
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          {!loading && savedRetention === null && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('common.refresh')}
            </Button>
          )}
        </form>
      )}
    </Modal>
  );
}
