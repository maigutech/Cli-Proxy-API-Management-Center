import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  captureSessionRoutingApi,
  type SessionRoutingSnapshot,
} from '@/services/api/sessionRouting';
import { notifyAuthFilesChanged } from '../authFilesEvents';
import {
  invalidRoutingFields,
  maximumFor,
  minimumFor,
  routingDirty,
  routingDraft,
  routingFields,
  routingOverrides,
  type SessionRoutingDraft,
} from '../sessionRouting';
import styles from './SessionRoutingSheet.module.scss';

export function SessionRoutingSheet({
  file,
  disableControls,
  onClose,
}: {
  file: AuthFileItem;
  disableControls: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [api] = useState(captureSessionRoutingApi);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const { showConfirmation, showNotification } = useNotificationStore();
  const [snapshot, setSnapshot] = useState<SessionRoutingSnapshot | null>(null);
  const [draft, setDraft] = useState<SessionRoutingDraft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const epoch = useRef(0);
  const alive = useRef(true);
  const authIndex = file.authIndex == null ? undefined : String(file.authIndex);

  useEffect(() => {
    alive.current = true;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!active || !api.isCurrent()) return;
      const version = epoch.current;
      try {
        const result = await api.get(file.name, authIndex);
        if (!active || !api.isCurrent() || version !== epoch.current) return;
        setSnapshot(result);
        setDraft((current) => current ?? routingDraft(result.overrides));
        setError('');
      } catch (cause) {
        if (active && api.isCurrent() && version === epoch.current) {
          setError(cause instanceof Error ? cause.message : t('session_routing.loadFailed'));
        }
      } finally {
        if (active && api.isCurrent()) timer = setTimeout(() => void load(), 5000);
      }
    };
    void load();
    return () => {
      active = false;
      alive.current = false;
      clearTimeout(timer);
    };
  }, [api, apiBase, managementKey, file.name, authIndex, t]);

  const dirty = Boolean(draft && snapshot && routingDirty(draft, snapshot.overrides));
  const invalid = draft ? invalidRoutingFields(draft) : [];
  const disabled = disableControls || saving || !snapshot?.editable || !api.isCurrent();
  const confirmClose = (): boolean | Promise<boolean> => {
    if (!dirty || !api.isCurrent()) return true;
    return new Promise((resolve) =>
      showConfirmation({
        title: t('providersPage.unsavedChanges.title'),
        message: t('providersPage.unsavedChanges.message'),
        variant: 'danger',
        confirmText: t('providersPage.unsavedChanges.discard'),
        cancelText: t('providersPage.unsavedChanges.keepEditing'),
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      })
    );
  };
  const save = async () => {
    if (!draft || disabled || invalid.length || !dirty) return;
    const version = ++epoch.current;
    setSaving(true);
    try {
      const result = await api.save(file.name, routingOverrides(draft), authIndex);
      if (!alive.current || !api.isCurrent() || version !== epoch.current) return;
      setSnapshot(result);
      setDraft(routingDraft(result.overrides));
      setError('');
      notifyAuthFilesChanged();
      showNotification(t('session_routing.saved'), 'success');
    } catch (cause) {
      if (alive.current && api.isCurrent() && version === epoch.current) {
        setError(cause instanceof Error ? cause.message : t('session_routing.saveFailed'));
      }
    } finally {
      if (alive.current && api.isCurrent() && version === epoch.current) {
        setSaving(false);
        epoch.current++;
      }
    }
  };
  const formatLimit = (value: number) =>
    value === 0 ? t('session_routing.unlimited') : String(value);
  return (
    <Sheet
      open
      onClose={onClose}
      confirmClose={confirmClose}
      closeDisabled={saving && api.isCurrent()}
      size="md"
      title={file.email || file.name}
      eyebrow={t('session_routing.title')}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={saving && api.isCurrent()}
            onClick={() =>
              void Promise.resolve(confirmClose()).then((ok) => {
                if (ok) onClose();
              })
            }
          >
            {t('common.close')}
          </Button>
          <Button
            disabled={disabled || !dirty || invalid.length > 0}
            loading={saving}
            onClick={() => void save()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className={styles.content}>
        {!api.isCurrent() ? (
          <p role="alert">{t('session_routing.connectionChanged')}</p>
        ) : (
          <>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            {!snapshot && !error && <LoadingSpinner />}
            {snapshot && draft && (
              <>
                <div className={styles.metrics}>
                  <div>
                    <span>{t('session_routing.sessions')}</span>
                    <strong>
                      {snapshot.activeSessions} /{' '}
                      {formatLimit(snapshot.effective.maxActiveSessions)}
                    </strong>
                  </div>
                  <div>
                    <span>{t('session_routing.requests')}</span>
                    <strong>
                      {snapshot.concurrentRequests} /{' '}
                      {formatLimit(snapshot.effective.maxConcurrentRequests)}
                    </strong>
                  </div>
                </div>
                <p className={styles.note}>{t('session_routing.description')}</p>
                <p className={styles.note}>
                  {t('session_routing.updated', {
                    time: new Date(snapshot.observedAt).toLocaleTimeString(),
                  })}
                </p>
                {routingFields.map((field) => (
                  <div className={styles.field} key={field}>
                    <div className={styles.fieldHeader}>
                      <span id={`session-routing-${field}`}>{t(`session_routing.${field}`)}</span>
                      <Select
                        value={draft[field].inherit ? 'inherit' : 'custom'}
                        ariaLabelledBy={`session-routing-${field}`}
                        disabled={disabled}
                        options={[
                          { value: 'inherit', label: t('session_routing.inherit') },
                          { value: 'custom', label: t('session_routing.custom') },
                        ]}
                        onChange={(mode) =>
                          setDraft({
                            ...draft,
                            [field]: {
                              inherit: mode === 'inherit',
                              value: draft[field].inherit
                                ? String(Math.ceil(snapshot.effective[field]))
                                : draft[field].value,
                            },
                          })
                        }
                      />
                    </div>
                    <Input
                      type="number"
                      step="1"
                      min={minimumFor(field)}
                      max={maximumFor(field)}
                      aria-label={t(`session_routing.${field}`)}
                      value={draft[field].inherit ? snapshot.defaults[field] : draft[field].value}
                      disabled={disabled || draft[field].inherit}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          [field]: { inherit: false, value: event.target.value },
                        })
                      }
                      hint={t(`session_routing.${field}Hint`)}
                      error={
                        invalid.includes(field)
                          ? t('session_routing.invalid', {
                              min: minimumFor(field),
                              max: maximumFor(field),
                            })
                          : undefined
                      }
                    />
                  </div>
                ))}
                {!snapshot.failoverEnabled && (
                  <div className={styles.note}>
                    {t('session_routing.failoverPrerequisite')}{' '}
                    <Link
                      to="/config?field=routingSessionAffinity"
                      onClick={(event) => {
                        if (dirty || saving) event.preventDefault();
                      }}
                      aria-disabled={dirty || saving}
                    >
                      {t('session_routing.globalSettings')}
                    </Link>
                  </div>
                )}
                {!snapshot.editable && <p>{t('session_routing.readOnly')}</p>}
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
