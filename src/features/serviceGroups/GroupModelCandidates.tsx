import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';
import {
  captureServiceGroupsApi,
  type GroupCredential,
  type GroupMember,
  type GroupModel,
  type GroupModelCandidates as Candidates,
} from '@/services/api/serviceGroups';
import { getErrorMessage } from '@/utils/helpers';
import { addableModels } from './logic';
import styles from './ServiceGroupsPage.module.scss';

interface Props {
  members: GroupMember[];
  models: GroupModel[];
  disabled: boolean;
  onFetched: (credentials: GroupCredential[]) => void;
  onAdd: (models: string[]) => void;
}

// The parent remounts this panel when the editor session, connection, or member IDs change.
export function GroupModelCandidates({ members, models, disabled, onFetched, onAdd }: Props) {
  const { t } = useTranslation();
  const [result, setResult] = useState<Candidates | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    []
  );

  const fetchModels = async () => {
    const generation = ++request.current;
    const revision = apiClient.getConnectionRevision();
    const api = captureServiceGroupsApi();
    const current = () =>
      generation === request.current && revision === apiClient.getConnectionRevision();
    setLoading(true);
    setError('');
    setResult(null);
    setSelected([]);
    try {
      const next = await api.modelCandidates(members);
      if (!current()) return;
      setResult(next);
      onFetched(next.credentials);
    } catch (e) {
      if (current()) setError(getErrorMessage(e));
    } finally {
      if (current()) setLoading(false);
    }
  };
  const available = addableModels(models, result?.models ?? []);
  const chosen = selected.filter((id) => available.includes(id));
  const disabledCount = result?.credentials.filter((c) => c.disabled).length ?? 0;
  const fetchedDate = result ? new Date(result.fetchedAt) : null;
  return (
    <section className={styles.modelCandidates} aria-label={t('service_groups.fetchModels')}>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          loading={loading}
          disabled={disabled || !members.length}
          onClick={() => void fetchModels()}
        >
          {t(loading ? 'service_groups.fetchingModels' : 'service_groups.fetchModels')}
        </Button>
        {!members.length && <span>{t('service_groups.selectMembersFirst')}</span>}
      </div>
      <p className={styles.candidateHint}>{t('service_groups.fetchModelsHelp')}</p>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      {result && (
        <>
          <p role="status">
            {t('service_groups.modelsFetched', {
              total: result.models.length,
              time:
                fetchedDate && Number.isFinite(fetchedDate.getTime())
                  ? fetchedDate.toLocaleTimeString()
                  : '—',
            })}
          </p>
          {disabledCount > 0 && (
            <p className={styles.candidateHint}>
              {t('service_groups.disabledModelMembers', { total: disabledCount })}
            </p>
          )}
          {result.models.length === 0 ? (
            <p>{t('service_groups.noPoolModels')}</p>
          ) : (
            <>
              <div className={styles.candidateList}>
                {result.models.map((id) => {
                  const added = !available.includes(id);
                  return (
                    <label key={id} className={styles.check}>
                      <input
                        type="checkbox"
                        disabled={disabled || added}
                        checked={added || chosen.includes(id)}
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked ? [...old, id] : old.filter((v) => v !== id)
                          )
                        }
                      />
                      <span>
                        {id}
                        {added && <small> · {t('service_groups.modelAlreadyMapped')}</small>}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  disabled={disabled || !available.length}
                  onClick={() => setSelected(chosen.length === available.length ? [] : available)}
                >
                  {t(
                    chosen.length === available.length && available.length > 0
                      ? 'service_groups.clearModelSelection'
                      : 'service_groups.selectAllModels'
                  )}
                </Button>
                <Button
                  disabled={disabled || !chosen.length}
                  onClick={() => {
                    onAdd(chosen);
                    setSelected([]);
                  }}
                >
                  {t('service_groups.addSelectedModels', { total: chosen.length })}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
