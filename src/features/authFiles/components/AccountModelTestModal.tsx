import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useAuthStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  captureAccountModelTestApi,
  type AccountTestInfo,
  type AccountTestResult,
} from '@/services/api/accountModelTest';
import { notifyAuthFilesChanged } from '../authFilesEvents';
import styles from './AccountModelTestModal.module.scss';

export function AccountModelTestModal({
  file,
  disableControls,
  onClose,
}: {
  file: AuthFileItem;
  disableControls: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [api] = useState(captureAccountModelTestApi);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const [info, setInfo] = useState<AccountTestInfo | null>(null);
  const [model, setModel] = useState('');
  const [result, setResult] = useState<AccountTestResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const request = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const authIndex = file.authIndex == null ? undefined : String(file.authIndex);
  const abort = useCallback(() => {
    epoch.current++;
    request.current?.abort();
    request.current = null;
  }, []);
  const load = useCallback(async () => {
    abort();
    if (!api.isCurrent()) return;
    const version = epoch.current;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const data = await api.get(file.name, authIndex, controller.signal);
      if (version !== epoch.current || !api.isCurrent()) return;
      setInfo(data);
      setModel((current) =>
        data.models.includes(current)
          ? current
          : (data.models.find((id) => id.includes('mini')) ?? data.models[0] ?? '')
      );
      setResult(null);
      setCancelled(false);
    } catch (cause) {
      if (version === epoch.current && api.isCurrent()) {
        setInfo(null);
        setError(cause instanceof Error ? cause.message : '');
      }
    } finally {
      if (version === epoch.current && api.isCurrent()) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [abort, api, file.name, authIndex]);
  useEffect(() => {
    void load();
    return abort;
  }, [load, abort, apiBase, managementKey]);

  const disabled = disableControls || !api.isCurrent();
  const start = async () => {
    if (disabled || request.current || !info || !model || !info.route.valid) return;
    const version = ++epoch.current;
    const controller = new AbortController();
    request.current = controller;
    setRunning(true);
    setResult(null);
    setError('');
    setCancelled(false);
    try {
      const data = await api.run(file.name, info.authIndex, model, controller.signal);
      if (version !== epoch.current || !api.isCurrent()) return;
      setResult(data);
      notifyAuthFilesChanged();
    } catch (cause) {
      if (version === epoch.current && api.isCurrent()) {
        setError(cause instanceof Error ? cause.message : t('account_test.failed'));
      }
    } finally {
      if (version === epoch.current && api.isCurrent()) {
        request.current = null;
        setRunning(false);
      }
    }
  };
  const close = () => {
    abort();
    onClose();
  };
  const activeRoute = result?.route ?? info?.route;
  const knownErrors = [
    'invalid_proxy',
    'execution_failed',
    'auth_failed',
    'capacity_exceeded',
    'quota_exceeded',
    'incomplete_response',
    'empty_response',
  ];
  const errorCode =
    result && knownErrors.includes(result.errorCode) ? result.errorCode : 'execution_failed';

  return (
    <Modal
      open
      title={t('account_test.title')}
      onClose={close}
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('common.close')}
          </Button>
          {running && api.isCurrent() ? (
            <Button
              variant="secondary"
              onClick={() => {
                abort();
                setRunning(false);
                setCancelled(true);
              }}
            >
              {t('account_test.cancel')}
            </Button>
          ) : (
            <Button
              onClick={() => void start()}
              disabled={disabled || loading || !info || !model || !info.route.valid}
            >
              {t('account_test.start')}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.content}>
        <strong className={styles.account}>{file.email || file.name}</strong>
        {!api.isCurrent() ? (
          <p role="alert">{t('account_test.connection_changed')}</p>
        ) : (
          <>
            <p className={styles.note}>{t('account_test.description')}</p>
            <div className={styles.modelRow}>
              <div className={styles.modelField}>
                <label id="account-test-model-label">{t('account_test.model')}</label>
                <Select
                  value={model}
                  onChange={(value) => {
                    setModel(value);
                    setResult(null);
                    setCancelled(false);
                  }}
                  ariaLabelledBy="account-test-model-label"
                  options={(info?.models ?? []).map((id) => ({ value: id, label: id }))}
                  placeholder={t(loading ? 'account_test.loading' : 'account_test.no_models')}
                  disabled={disabled || running || loading || !info?.models.length}
                />
              </div>
              <Button
                variant="secondary"
                disabled={disabled || running || loading}
                onClick={() => void load()}
              >
                {t('account_test.refresh')}
              </Button>
            </div>
            {activeRoute && (
              <div className={styles.route}>
                <span>
                  {t('account_test.route')} · {t(`account_test.source_${activeRoute.source}`)}
                </span>
                <code>{activeRoute.endpoint || t(`account_test.mode_${activeRoute.mode}`)}</code>
                {!activeRoute.valid && (
                  <span className={styles.error}>{t('account_test.errors.invalid_proxy')}</span>
                )}
                <small>{t('account_test.route_note')}</small>
              </div>
            )}
            <div className={styles.console} aria-live="polite" aria-busy={running}>
              <span className={styles.note}>{t('account_test.prompt')}</span>
              <pre>{info?.prompt || 'Reply with exactly OK.'}</pre>
              {loading && <p>{t('account_test.loading')}</p>}
              {!loading && info && info.models.length === 0 && <p>{t('account_test.no_models')}</p>}
              {running && <p>{t('account_test.running')}</p>}
              {cancelled && <p>{t('account_test.cancelled')}</p>}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              {result && (
                <>
                  <div className={styles.resultHeader}>
                    <strong className={result.success ? styles.success : styles.error}>
                      {t(result.success ? 'account_test.success' : 'account_test.failed')}
                    </strong>
                    <span>{t('account_test.duration', { ms: result.durationMs })}</span>
                  </div>
                  <span className={styles.note}>
                    {result.model}
                    {result.httpStatus ? ` · HTTP ${result.httpStatus}` : ''}
                  </span>
                  {result.output && <pre className={styles.output}>{result.output}</pre>}
                  {!result.success && (
                    <p className={styles.error}>{t(`account_test.errors.${errorCode}`)}</p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
