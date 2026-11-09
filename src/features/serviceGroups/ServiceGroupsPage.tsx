import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore } from '@/stores';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiClient } from '@/services/api/client';
import {
  captureServiceGroupsApi,
  type GroupBoard,
  type GroupCredential,
  type GroupUsage,
  type MigrationPreview,
  type ServiceGroup,
} from '@/services/api/serviceGroups';
import { getErrorMessage } from '@/utils/helpers';
import { appendModels, groupValidation, newGroup, supportedModels } from './logic';
import { GroupKeyControl } from './GroupKeyControl';
import { GroupModelCandidates } from './GroupModelCandidates';
import styles from './ServiceGroupsPage.module.scss';

type Tab = 'overview' | 'members' | 'models' | 'policy' | 'usage';

export function ServiceGroupsPage() {
  const { t } = useTranslation();
  const apiBase = useAuthStore((s) => s.apiBase);
  const managementKey = useAuthStore((s) => s.managementKey);
  const connected = useAuthStore((s) => s.connectionStatus === 'connected');
  const [board, setBoard] = useState<GroupBoard | null>(null);
  const [draft, setDraft] = useState<ServiceGroup | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [editorSession, setEditorSession] = useState(0);
  const [modelCredentials, setModelCredentials] = useState<GroupCredential[] | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: 'rotate' | 'archive';
    group: ServiceGroup;
  } | null>(null);
  const [usage, setUsage] = useState<GroupUsage | null>(null);
  const [search, setSearch] = useState('');
  const generation = useRef(0);
  const activeDraft = useRef<string | undefined>(undefined);
  useEffect(() => {
    activeDraft.current = draft?.id;
  }, [draft?.id]);
  const load = useCallback(async () => {
    const gen = ++generation.current;
    const revision = apiClient.getConnectionRevision();
    setLoading(true);
    try {
      const next = await captureServiceGroupsApi().list();
      if (gen === generation.current && revision === apiClient.getConnectionRevision()) {
        setBoard(next);
        setError('');
      }
    } catch (e) {
      if (gen === generation.current && revision === apiClient.getConnectionRevision())
        setError(getErrorMessage(e));
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setBusy(false);
    setLoading(false);
    setBoard(null);
    setDraft(null);
    setModelCredentials(null);
    setPreview(null);
    setConfirm(null);
    setUsage(null);
    setError('');
    if (connected) void load();
    return () => {
      generation.current += 1;
    };
  }, [apiBase, managementKey, connected, load]);
  useHeaderRefresh(load);
  const act = async (work: (api: ReturnType<typeof captureServiceGroupsApi>) => Promise<void>) => {
    const revision = apiClient.getConnectionRevision();
    const api = captureServiceGroupsApi();
    setBusy(true);
    setError('');
    try {
      await work(api);
    } catch (e) {
      if (revision === apiClient.getConnectionRevision()) setError(getErrorMessage(e));
    } finally {
      if (revision === apiClient.getConnectionRevision()) setBusy(false);
    }
  };
  const open = (group: ServiceGroup) => {
    setEditorSession((value) => value + 1);
    setModelCredentials(null);
    setDraft(structuredClone(group));
    setDraftVersion(board?.version ?? 0);
    setTab('overview');
    setUsage(null);
    setSearch('');
    setError('');
  };
  const update = (change: Partial<ServiceGroup>) => {
    if (
      change.members &&
      JSON.stringify(change.members.map((m) => m.credentialId).sort()) !==
        JSON.stringify(draft?.members.map((m) => m.credentialId).sort())
    ) {
      setModelCredentials(null);
    }
    setDraft((old) => (old ? { ...old, ...change } : old));
  };
  const credentials = modelCredentials ?? board?.credentials ?? [];
  const models = draft ? supportedModels(draft, credentials) : [];
  const validation = draft ? groupValidation(draft, credentials) : null;
  const current = () => apiClient.getConnectionRevision();
  const save = () => {
    if (!draft || !board || validation) return;
    const revision = current();
    void act(async (api) => {
      await api.preview(draft);
      await api.save(draft, draftVersion);
      if (revision !== current()) return;
      setDraft(null);
      await load();
    });
  };
  const prepare = () => {
    const revision = current();
    void act(async (api) => {
      const p = await api.prepare();
      if (revision !== current()) return;
      setPreview(p);
      await load();
    });
  };
  const loadUsage = () => {
    if (!draft?.id) return;
    const revision = current();
    const id = draft.id;
    setTab('usage');
    void act(async (api) => {
      const u = await api.usage(id);
      if (revision === current() && activeDraft.current === id) setUsage(u);
    });
  };
  const runConfirmed = () => {
    if (!confirm || !board) return;
    const revision = current();
    const operation = confirm;
    void act(async (api) => {
      if (operation.kind === 'rotate') {
        await api.rotate(operation.group.id, board.version);
        if (revision !== current()) return;
      } else await api.archive(operation.group.id, board.version);
      if (revision !== current()) return;
      setConfirm(null);
      setDraft(null);
      await load();
    });
  };
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t('service_groups.title')}</h1>
          <p>{t('service_groups.subtitle')}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" disabled={busy} loading={loading} onClick={() => void load()}>
            {t('service_groups.refresh')}
          </Button>
          {board?.mode === 'grouped' && (
            <Button disabled={busy} onClick={() => open(newGroup())}>
              {t('service_groups.create')}
            </Button>
          )}
        </div>
      </header>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      {!board && !loading && <p>{t('service_groups.unsupported')}</p>}
      {board?.mode === 'legacy' && (
        <section className={styles.welcome}>
          <h2>{t('service_groups.initializeTitle')}</h2>
          <p>{t('service_groups.initializeBody')}</p>
          <p>{t('service_groups.boundaries')}</p>
          <Button loading={busy} onClick={prepare}>
            {t('service_groups.previewMigration')}
          </Button>
        </section>
      )}
      {board?.mode === 'grouped' && (
        <>
          <div className={styles.notice}>{t('service_groups.isolation')}</div>
          <div className={styles.grid}>
            {board.groups
              .filter((g) => !g.archived)
              .map((group) => (
                <article className={styles.card} key={group.id}>
                  <div className={styles.cardTitle}>
                    <h2>{group.name}</h2>
                    <span className={group.enabled ? styles.active : styles.paused}>
                      {t(group.enabled ? 'service_groups.enabled' : 'service_groups.disabled')}
                    </span>
                  </div>
                  <p className={styles.note}>{group.note || t('service_groups.noNote')}</p>
                  <GroupKeyControl
                    key={`${apiClient.getConnectionRevision()}:${group.id}:${group.keyVersion}:${group.keyAvailable}`}
                    group={group}
                    disabled={busy}
                    onRestored={load}
                  />
                  <p>
                    {t('service_groups.resources', {
                      members: group.members.length,
                      models: group.models.length,
                    })}
                  </p>
                  <div className={styles.health}>
                    {(board.statuses[group.id] ?? []).map((status) => (
                      <div key={status.name}>
                        <strong>{status.name}</strong>
                        <span>
                          {t('service_groups.availability', {
                            count: status.available,
                            total: status.supported,
                          })}
                        </span>
                        {status.cooldown503 > 0 && (
                          <span className={styles.cooldown}>
                            {t('service_groups.cooldown503', { count: status.cooldown503 })}
                          </span>
                        )}
                        {status.cooling > status.cooldown503 && (
                          <span>
                            {t('service_groups.otherCooldown', {
                              count: status.cooling - status.cooldown503,
                            })}
                          </span>
                        )}
                        {status.retryAt && (
                          <small>
                            {t('service_groups.retryAt', {
                              time: new Date(status.retryAt).toLocaleTimeString(),
                            })}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => open(group)}>
                      {t('service_groups.manage')}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirm({ kind: 'archive', group })}>
                      {t('service_groups.archive')}
                    </Button>
                  </div>
                </article>
              ))}
          </div>
          {board.groups.every((g) => g.archived) && <p>{t('service_groups.empty')}</p>}
          <p className={styles.muted}>{t('service_groups.boundaries')}</p>
        </>
      )}
      <Modal
        open={draft !== null}
        title={draft?.id ? draft.name : t('service_groups.create')}
        width={920}
        onClose={() => setDraft(null)}
        closeDisabled={busy}
        footer={
          <div className={styles.actions}>
            <Button variant="secondary" disabled={busy} onClick={() => setDraft(null)}>
              {t('service_groups.cancel')}
            </Button>
            <Button disabled={!!validation} loading={busy} onClick={save}>
              {t('service_groups.save')}
            </Button>
          </div>
        }
      >
        {draft && board && (
          <div className={styles.editor}>
            <div className={styles.tabs} role="tablist" aria-label={t('service_groups.details')}>
              {(['overview', 'members', 'models', 'policy', 'usage'] as Tab[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={tab === name}
                  disabled={name === 'usage' && !draft.id}
                  onClick={() => (name === 'usage' ? loadUsage() : setTab(name))}
                >
                  {t(`service_groups.${name}`)}
                </button>
              ))}
            </div>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            {validation && <p className={styles.notice}>{t(`service_groups.${validation}`)}</p>}
            <div role="tabpanel">
              {tab === 'overview' && (
                <>
                  <Input
                    label={t('service_groups.name')}
                    value={draft.name}
                    maxLength={120}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                  <Input
                    label={t('service_groups.note')}
                    value={draft.note}
                    maxLength={1000}
                    onChange={(e) => update({ note: e.target.value })}
                  />
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => update({ enabled: e.target.checked })}
                    />
                    {t('service_groups.enableGroup')}
                  </label>
                  <p className={styles.muted}>{t('service_groups.streamNotice')}</p>
                  <Input
                    label={t('service_groups.baseUrl')}
                    value={`${apiBase.replace(/\/$/, '')}/v1`}
                    readOnly
                  />
                  {draft.id && (
                    <>
                      <GroupKeyControl
                        key={`${apiClient.getConnectionRevision()}:${draft.id}:${draft.keyVersion}:${draft.keyAvailable}`}
                        group={draft}
                        disabled={busy}
                        onRestored={async () => {
                          setDraft(null);
                          await load();
                        }}
                      />
                      <Button
                        variant="secondary"
                        onClick={() => setConfirm({ kind: 'rotate', group: draft })}
                      >
                        {t('service_groups.rotate')}
                      </Button>
                    </>
                  )}
                </>
              )}
              {tab === 'members' && (
                <>
                  <p>{t('service_groups.memberHelp')}</p>
                  <Input
                    label={t('service_groups.search')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const available = board.credentials.filter(
                        (c) => c.id && !c.conflict && c.groups.length === 0
                      );
                      update({
                        members: [
                          ...draft.members,
                          ...available
                            .filter((c) => !draft.members.some((m) => m.credentialId === c.id))
                            .map((c) => ({ credentialId: c.id })),
                        ],
                      });
                    }}
                  >
                    {t('service_groups.selectUnassigned')}
                  </Button>
                  <div className={styles.memberList}>
                    {board.credentials
                      .filter((c) =>
                        `${c.name} ${c.provider}`.toLowerCase().includes(search.toLowerCase())
                      )
                      .map((credential) => {
                        const member = draft.members.find((m) => m.credentialId === credential.id);
                        return (
                          <div key={credential.authId} className={styles.member}>
                            <label className={styles.check}>
                              <input
                                type="checkbox"
                                disabled={!credential.id || credential.conflict}
                                checked={!!member}
                                onChange={(e) =>
                                  update({
                                    members: e.target.checked
                                      ? [...draft.members, { credentialId: credential.id }]
                                      : draft.members.filter(
                                          (m) => m.credentialId !== credential.id
                                        ),
                                  })
                                }
                              />
                              <span>
                                <strong>{credential.name}</strong>
                                <small>
                                  {credential.provider}
                                  {credential.disabled ? ` · ${t('service_groups.disabled')}` : ''}
                                </small>
                                {credential.groups.length > 0 && (
                                  <small>
                                    {t('service_groups.sharedWith', {
                                      names: credential.groups.join(', '),
                                    })}
                                  </small>
                                )}
                                {(!credential.id || credential.conflict) && (
                                  <small className={styles.cooldown}>
                                    {t('service_groups.identityMissing')}
                                  </small>
                                )}
                              </span>
                            </label>
                            {member && (
                              <div className={styles.memberWeights}>
                                <Input
                                  label={t('service_groups.priority')}
                                  type="number"
                                  value={member.priority ?? ''}
                                  placeholder={t('service_groups.inherit')}
                                  onChange={(e) =>
                                    update({
                                      members: draft.members.map((m) =>
                                        m.credentialId === credential.id
                                          ? {
                                              ...m,
                                              priority:
                                                e.target.value === ''
                                                  ? undefined
                                                  : Number(e.target.value),
                                            }
                                          : m
                                      ),
                                    })
                                  }
                                />
                                <Input
                                  label={t('service_groups.weight')}
                                  type="number"
                                  min={0}
                                  max={1000000}
                                  value={member.weight ?? ''}
                                  placeholder={t('service_groups.inherit')}
                                  onChange={(e) =>
                                    update({
                                      members: draft.members.map((m) =>
                                        m.credentialId === credential.id
                                          ? {
                                              ...m,
                                              weight:
                                                e.target.value === ''
                                                  ? undefined
                                                  : Number(e.target.value),
                                            }
                                          : m
                                      ),
                                    })
                                  }
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      const revision = current();
                      void act(async (api) => {
                        await api.prepare();
                        if (revision === current()) await load();
                      });
                    }}
                  >
                    {t('service_groups.refreshIdentities')}
                  </Button>
                </>
              )}
              {tab === 'models' && (
                <>
                  <p>{t('service_groups.modelHelp')}</p>
                  <GroupModelCandidates
                    key={JSON.stringify([
                      editorSession,
                      apiClient.getConnectionRevision(),
                      draft.members.map((m) => m.credentialId).sort(),
                    ])}
                    members={draft.members}
                    models={draft.models}
                    disabled={busy}
                    onFetched={setModelCredentials}
                    onAdd={(selected) =>
                      setDraft((old) =>
                        old ? { ...old, models: appendModels(old.models, selected) } : old
                      )
                    }
                  />
                  {draft.models.map((model, index) => (
                    <div className={styles.modelRow} key={index}>
                      <Input
                        label={t('service_groups.publicModel')}
                        value={model.name}
                        onChange={(e) =>
                          update({
                            models: draft.models.map((m, i) =>
                              i === index ? { ...m, name: e.target.value } : m
                            ),
                          })
                        }
                      />
                      <label>
                        {t('service_groups.targetModel')}
                        <select
                          className="input"
                          value={model.target}
                          onChange={(e) =>
                            update({
                              models: draft.models.map((m, i) =>
                                i === index ? { ...m, target: e.target.value } : m
                              ),
                            })
                          }
                        >
                          <option value="">{t('service_groups.chooseModel')}</option>
                          {[...new Set([...models, model.target].filter(Boolean))].map((name) => (
                            <option value={name} key={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          update({ models: draft.models.filter((_, i) => i !== index) })
                        }
                      >
                        {t('service_groups.remove')}
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    onClick={() => update({ models: [...draft.models, { name: '', target: '' }] })}
                  >
                    {t('service_groups.addModel')}
                  </Button>
                </>
              )}
              {tab === 'policy' && (
                <>
                  <Input
                    label={t('service_groups.concurrency')}
                    hint={t('service_groups.concurrencyHelp')}
                    type="number"
                    min={0}
                    max={100000}
                    value={draft.maxConcurrent}
                    onChange={(e) => update({ maxConcurrent: Number(e.target.value) })}
                  />
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={draft.allowAuto}
                      onChange={(e) => update({ allowAuto: e.target.checked })}
                    />
                    {t('service_groups.allowAuto')}
                  </label>
                  <p className={styles.notice}>{t('service_groups.policyHelp')}</p>
                </>
              )}
              {tab === 'usage' && (
                <div className={styles.usage}>
                  <p>{t('service_groups.usageHelp')}</p>
                  {usage && (
                    <dl>
                      <dt>{t('service_groups.requests')}</dt>
                      <dd>{usage.summary.requests.toLocaleString()}</dd>
                      <dt>{t('service_groups.failed')}</dt>
                      <dd>{usage.summary.failed.toLocaleString()}</dd>
                      <dt>{t('service_groups.tokens')}</dt>
                      <dd>{usage.summary.tokens.toLocaleString()}</dd>
                      <dt>{t('service_groups.cost')}</dt>
                      <dd>${usage.summary.cost.toFixed(4)}</dd>
                    </dl>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!preview}
        title={t('service_groups.previewMigration')}
        onClose={() => setPreview(null)}
        closeDisabled={busy}
        footer={
          <Button
            loading={busy}
            disabled={!preview?.keyCount || !preview?.memberCount || !preview?.models.length}
            onClick={() => {
              if (!preview) return;
              const p = preview;
              const revision = current();
              void act(async (api) => {
                await api.activate(p);
                if (revision !== current()) return;
                setPreview(null);
                await load();
              });
            }}
          >
            {t('service_groups.activate')}
          </Button>
        }
      >
        {preview && (
          <>
            <p>
              {t('service_groups.migrationCounts', {
                keys: preview.keyCount,
                members: preview.memberCount,
                models: preview.models.length,
              })}
            </p>
            <p>{t('service_groups.migrationNotice')}</p>
            <p>{t('service_groups.boundaries')}</p>
            <details>
              <summary>{t('service_groups.models')}</summary>
              <div className={styles.modelPreview}>
                {preview.models.map((m) => (
                  <code key={m.name}>{m.name}</code>
                ))}
              </div>
            </details>
          </>
        )}
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
      </Modal>
      <Modal
        open={!!confirm}
        title={t(`service_groups.${confirm?.kind ?? 'rotate'}`)}
        onClose={() => setConfirm(null)}
        closeDisabled={busy}
        footer={
          <Button variant="danger" loading={busy} onClick={runConfirmed}>
            {t('service_groups.confirm')}
          </Button>
        }
      >
        <p>{confirm?.group.name}</p>
        <p>
          {t(
            confirm?.kind === 'archive'
              ? 'service_groups.archiveNotice'
              : 'service_groups.rotateNotice'
          )}
        </p>
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
      </Modal>
    </div>
  );
}
