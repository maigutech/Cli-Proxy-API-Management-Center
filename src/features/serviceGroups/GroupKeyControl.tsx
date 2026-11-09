import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { IconCopy, IconEye, IconEyeOff } from '@/components/ui/icons';
import { apiClient } from '@/services/api/client';
import { captureServiceGroupsApi, type ServiceGroup } from '@/services/api/serviceGroups';
import { copyToClipboard } from '@/utils/clipboard';
import { getErrorMessage } from '@/utils/helpers';
import styles from './ServiceGroupsPage.module.scss';

export function GroupKeyControl({
  group,
  disabled = false,
  onRestored,
}: {
  group: ServiceGroup;
  disabled?: boolean;
  onRestored: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [restore, setRestore] = useState(false);
  const [original, setOriginal] = useState('');
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  const run = async (action: 'show' | 'copy' | 'restore') => {
    const gen = ++generation.current;
    const revision = apiClient.getConnectionRevision();
    const current = () =>
      gen === generation.current && revision === apiClient.getConnectionRevision();
    const api = captureServiceGroupsApi();
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      if (action === 'restore') {
        await api.restoreKey(group, original.trim());
        if (!current()) return;
        setOriginal('');
        setRestore(false);
        await onRestored();
        return;
      }
      const key = await api.key(group);
      if (!current()) return;
      if (action === 'show') setRevealed(key);
      else {
        const success = await copyToClipboard(key);
        if (!current()) return;
        if (success) setCopied(true);
        else setError(t('service_groups.copyFailed'));
      }
    } catch (e) {
      if (current()) setError(getErrorMessage(e));
    } finally {
      if (current()) setBusy(false);
    }
  };

  return (
    <div className={styles.keyControl}>
      <span className={styles.keyLabel}>{t('service_groups.key')}</span>
      <div className={styles.keyRow}>
        <code aria-label={t('service_groups.key')}>{revealed || group.keyPrefix}</code>
        <div className={styles.actions}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy || !group.keyAvailable}
            aria-label={t(revealed ? 'service_groups.hideKey' : 'service_groups.showKey')}
            title={t(revealed ? 'service_groups.hideKey' : 'service_groups.showKey')}
            onClick={() => (revealed ? setRevealed('') : void run('show'))}
          >
            {revealed ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || !group.keyAvailable}
            loading={busy}
            onClick={() => void run('copy')}
          >
            <IconCopy size={14} /> {t('service_groups.copy')}
          </Button>
        </div>
      </div>
      {copied && <small role="status">{t('service_groups.copied')}</small>}
      {!group.keyAvailable && (
        <>
          <p className={styles.muted}>{t('service_groups.keyNotRetained')}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => {
              setRestore(!restore);
              setOriginal('');
            }}
          >
            {t(restore ? 'service_groups.cancel' : 'service_groups.restoreKey')}
          </Button>
          {restore && (
            <div>
              <Input
                type="password"
                autoComplete="off"
                label={t('service_groups.originalKey')}
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                disabled={disabled || !original.trim()}
                loading={busy}
                onClick={() => void run('restore')}
              >
                {t('service_groups.restoreKey')}
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </div>
  );
}
