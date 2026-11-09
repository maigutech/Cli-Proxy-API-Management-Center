import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { captureServiceGroupsApi, type GroupBoard } from '@/services/api/serviceGroups';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { getErrorMessage } from '@/utils/helpers';
import {
  credentialGroupIds,
  membershipCredential,
  membershipRemovalIssue,
} from './accountMembership';
import styles from './AccountGroupsModal.module.scss';

export function AccountGroupsModal({
  file,
  onClose,
  onSaved,
}: {
  file: AuthFileItem;
  onClose: () => void;
  onSaved: (board: GroupBoard, revision: number) => void;
}) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [api] = useState(captureServiceGroupsApi);
  useAuthStore((state) => state.apiBase);
  useAuthStore((state) => state.managementKey);
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const [board, setBoard] = useState<GroupBoard | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const mounted = useRef(false);
  const pending = useRef(false);
  const formId = useId();
  const stale = !api.isCurrent() || !connected;
  const credential = membershipCredential(board, file);
  const original = board && credential ? credentialGroupIds(board, credential.id) : [];
  const dirty =
    selected.length !== original.length || selected.some((id) => !original.includes(id));
  const issue = board && credential ? membershipRemovalIssue(board, credential.id, selected) : null;
  const options = board?.groups.filter((group) => !group.archived) ?? [];
  const visible = options.filter((group) =>
    group.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
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
    setLoading(true);
    setBoard(null);
    setError('');
    setConflict(false);
    void api
      .list()
      .then((next) => {
        if (!active || !api.isCurrent()) return;
        const target = membershipCredential(next, file);
        setBoard(next);
        setSelected(target ? credentialGroupIds(next, target.id) : []);
      })
      .catch((cause: unknown) => {
        if (active && api.isCurrent()) setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (active && api.isCurrent()) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, file, reload, stale]);

  const save = async () => {
    if (
      pending.current ||
      !current() ||
      loading ||
      conflict ||
      !board ||
      !credential ||
      !dirty ||
      issue
    )
      return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const next = await api.setMemberships(credential.id, selected, board.version);
      if (!current()) return;
      onSaved(next, api.revision);
      showNotification(t('service_groups.membershipsSaved'), 'success');
      onClose();
    } catch (cause) {
      if (!current()) return;
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'status' in cause &&
        cause.status === 409
      ) {
        setConflict(true);
      } else {
        setError(getErrorMessage(cause));
      }
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t('service_groups.editMemberships')}
      width={480}
      onClose={onClose}
      closeDisabled={saving && !stale}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving && !stale}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={saving}
            disabled={stale || loading || conflict || !credential || !dirty || Boolean(issue)}
          >
            {t('common.save')}
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
          <div className={styles.account}>{deriveAuthFileIdentity(file).primary}</div>
          <p className={styles.hint}>{t('service_groups.membershipEditorHint')}</p>
          {loading ? (
            <div role="status">
              <LoadingSpinner /> {t('common.loading')}
            </div>
          ) : (
            board &&
            (credential ? (
              <>
                <Input
                  type="search"
                  value={search}
                  placeholder={t('service_groups.searchGroups')}
                  aria-label={t('service_groups.searchGroups')}
                  disabled={saving || conflict}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div
                  className={styles.options}
                  role="group"
                  aria-label={t('service_groups.belongsTo')}
                >
                  {visible.map((group) => (
                    <div
                      key={group.id}
                      className={`${styles.option} ${selected.includes(group.id) ? styles.selected : ''}`}
                    >
                      <SelectionCheckbox
                        checked={selected.includes(group.id)}
                        ariaLabel={group.name}
                        disabled={saving || conflict}
                        className={styles.checkbox}
                        onChange={(checked) => {
                          setSelected((value) =>
                            checked ? [...value, group.id] : value.filter((id) => id !== group.id)
                          );
                          setError('');
                        }}
                        label={
                          <span className={styles.groupLabel}>
                            <span>{group.name}</span>
                            {!group.enabled && <small>{t('service_groups.disabled')}</small>}
                          </span>
                        }
                      />
                    </div>
                  ))}
                  {!visible.length && (
                    <p className={styles.hint}>
                      {t(
                        options.length
                          ? 'service_groups.noMatchingGroups'
                          : 'service_groups.noMembershipGroups'
                      )}
                    </p>
                  )}
                </div>
                <div className={styles.summary} aria-live="polite">
                  <span>{t('service_groups.selectedGroups', { count: selected.length })}</span>
                  {selected.length > 1 && <span>{t('service_groups.sharedAccount')}</span>}
                </div>
                {!selected.length && (
                  <p className={styles.hint}>{t('service_groups.unassignedWarning')}</p>
                )}
                {issue && (
                  <div className="error-box" role="alert">
                    {t(`service_groups.${issue.key}`, issue)}
                  </div>
                )}
              </>
            ) : (
              <div className="error-box" role="alert">
                {t(
                  board.mode === 'grouped'
                    ? 'service_groups.identityMissing'
                    : 'service_groups.initializeTitle'
                )}
              </div>
            ))
          )}
          {(error || conflict) && (
            <div className="error-box" role="alert">
              {conflict ? t('service_groups.membershipConflict') : error}
            </div>
          )}
          {!loading && (!board || !credential || conflict) && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setReload((value) => value + 1)}
            >
              {t('service_groups.reloadMemberships')}
            </Button>
          )}
        </form>
      )}
    </Modal>
  );
}
