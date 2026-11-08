import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  captureUsageApi,
  type AccountUsage,
  type UsageDetails,
  type UsageRecord,
} from '@/services/api/accountUsage';
import { AccountUsageCard } from './AccountUsageCard';
import { dateLabel, money, totalMoney, usageRange } from './format';
import { notifyUsageChanged } from './useAccountUsage';
import styles from './Usage.module.scss';

function RecordBreakdown({ row }: { row: UsageRecord }) {
  const { t } = useTranslation();
  const p = row.price;
  const rates = row.longContext ? p?.longContext : p?.rates;
  return (
    <details className={styles.detail}>
      <summary>
        {row.cost
          ? money(row.cost.total)
          : t(`account_usage.status_${row.costStatus}`, {
              defaultValue: t('account_usage.unknownCost'),
            })}
      </summary>
      <dl>
        <dt>{t('account_usage.requestedModel')}</dt>
        <dd>{row.requestedModel}</dd>
        <dt>{t('account_usage.upstreamModel')}</dt>
        <dd>{row.upstreamModel}</dd>
        <dt>{t('account_usage.responseModel')}</dt>
        <dd>{row.responseModel || '—'}</dd>
        <dt>{t('account_usage.tier')}</dt>
        <dd>{row.serviceTier}</dd>
        <dt>{t('account_usage.reasoning')}</dt>
        <dd>{row.reasoning.toLocaleString()}</dd>
        <dt>{t('account_usage.priceVersion')}</dt>
        <dd>{p?.version ?? '—'}</dd>
        <dt>{t('account_usage.longContext')}</dt>
        <dd>{t(row.longContext ? 'common.yes' : 'common.no')}</dd>
        {rates && (
          <>
            <dt>{t('account_usage.inputRate')}</dt>
            <dd>{money(rates.input)}</dd>
            <dt>{t('account_usage.cacheReadRate')}</dt>
            <dd>{money(rates.cacheRead)}</dd>
            <dt>{t('account_usage.cacheWriteRate')}</dt>
            <dd>{money(rates.cacheWrite)}</dd>
            <dt>{t('account_usage.cacheWrite30mRate')}</dt>
            <dd>{money(rates.cacheWrite30m)}</dd>
            <dt>{t('account_usage.cacheWrite12hRate')}</dt>
            <dd>{money(rates.cacheWrite12h)}</dd>
            <dt>{t('account_usage.outputRate')}</dt>
            <dd>{money(rates.output)}</dd>
          </>
        )}
        {row.cost && (
          <>
            <dt>{t('account_usage.inputCost')}</dt>
            <dd>{money(row.cost.input)}</dd>
            <dt>{t('account_usage.cacheReadCost')}</dt>
            <dd>{money(row.cost.cacheRead)}</dd>
            <dt>{t('account_usage.cacheWriteCost')}</dt>
            <dd>{money(row.cost.cacheWrite)}</dd>
            <dt>{t('account_usage.outputCost')}</dt>
            <dd>{money(row.cost.output)}</dd>
          </>
        )}
        <dt>{t('account_usage.execution')}</dt>
        <dd>{row.executionId}</dd>
        {row.traceId && (
          <>
            <dt>{t('account_usage.trace')}</dt>
            <dd>{row.traceId}</dd>
          </>
        )}
      </dl>
    </details>
  );
}

export function AccountUsageSheet({
  file,
  onClose,
  onPrices,
}: {
  file: AuthFileItem;
  onClose: () => void;
  onPrices: () => void;
}) {
  const { t } = useTranslation();
  const [api] = useState(captureUsageApi);
  const apiBase = useAuthStore((s) => s.apiBase);
  const managementKey = useAuthStore((s) => s.managementKey);
  const [mode, setMode] = useState('seven');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [source, setSource] = useState('');
  const [model, setModel] = useState('');
  const [cursors, setCursors] = useState<number[]>([0]);
  const [anchor, setAnchor] = useState(Date.now);
  const [result, setResult] = useState<UsageDetails | null>(null);
  const [account, setAccount] = useState<AccountUsage | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const index = String(file.authIndex ?? '');
  const cursor = cursors[cursors.length - 1];
  const stale = !api.isCurrent();
  const isCodex = String(file.provider ?? file.type).toLowerCase() === 'codex';

  useEffect(() => {
    if (!api.isCurrent()) return;
    const range = usageRange(mode, from, to, new Date(anchor));
    if (!range) {
      setError(t('account_usage.invalidRange'));
      setLoading(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void Promise.all([
      api.details({ authIndex: index, ...range, model, source, before: cursor }, controller.signal),
      api.accounts([index], controller.signal),
    ])
      .then(([details, accounts]) => {
        if (active && api.isCurrent()) {
          setResult(details);
          setAccount(accounts.accounts[index]);
        }
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
  }, [api, apiBase, managementKey, index, mode, from, to, source, model, cursor, anchor, t]);

  const refresh = () => {
    setCursors([0]);
    setAnchor(Date.now());
    notifyUsageChanged();
  };
  const act = async (action: () => Promise<unknown>) => {
    if (busy || stale) return;
    setBusy(true);
    setActionError('');
    try {
      await action();
      if (api.isCurrent()) refresh();
    } catch (cause) {
      if (api.isCurrent())
        setActionError(cause instanceof Error ? cause.message : t('account_usage.loadFailed'));
    } finally {
      if (api.isCurrent()) setBusy(false);
    }
  };

  return (
    <Sheet
      open
      size="xl"
      title={file.email || file.name}
      eyebrow={t('account_usage.details')}
      onClose={onClose}
    >
      <div className={styles.content}>
        <p className={styles.hint}>{t('account_usage.disclaimer')}</p>
        {stale ? (
          <p role="alert" className={styles.warning}>
            {t('account_usage.connectionChanged')}
          </p>
        ) : (
          <>
            <AccountUsageCard usage={account} />
            <div className={styles.row}>
              <span className={styles.hint}>
                {t('account_usage.captureSince', {
                  time: dateLabel(account?.trackingSince || result?.status.captureSince),
                })}
              </span>
              <div className={styles.toolbar}>
                <Button variant="secondary" size="sm" onClick={onPrices}>
                  {t('account_usage.prices')}
                </Button>
                {isCodex && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || file.disabled}
                    onClick={() => void act(() => api.refreshQuota(file.name, index))}
                  >
                    {t('account_usage.refreshQuota')}
                  </Button>
                )}
              </div>
            </div>
            {isCodex && (
              <div className={styles.section}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={account?.exclusive ?? false}
                    disabled={busy || !account}
                    onChange={(e) => void act(() => api.exclusive(index, e.target.checked))}
                  />
                  {t('account_usage.exclusive')}
                </label>
                <span className={styles.hint}>{t('account_usage.estimateHint')}</span>
                {account?.quota && (
                  <>
                    <span className={styles.hint}>
                      {t('account_usage.quotaObserved', {
                        time: dateLabel(account.quota.observedAt),
                      })}
                    </span>
                    <span className={styles.hint}>
                      {account.quota.estimatedTotal === null
                        ? t(`account_usage.estimate_${account.quota.estimateReason}`, {
                            defaultValue: t('account_usage.estimateUnavailable'),
                          })
                        : t('account_usage.estimateAmounts', {
                            total: money(account.quota.estimatedTotal),
                            remaining: money(account.quota.estimatedRemaining),
                          })}
                    </span>
                  </>
                )}
              </div>
            )}
            {actionError && (
              <p role="alert" className={styles.warning}>
                {actionError}
              </p>
            )}
            <div className={styles.filters}>
              <Select
                value={mode}
                ariaLabel={t('account_usage.range')}
                options={[
                  { value: 'today', label: t('account_usage.todayRange') },
                  { value: 'seven', label: t('account_usage.sevenRange') },
                  { value: 'custom', label: t('account_usage.customRange') },
                ]}
                onChange={(value) => {
                  setMode(value);
                  setCursors([0]);
                  setAnchor(Date.now());
                }}
              />
              <Select
                value={source}
                ariaLabel={t('account_usage.source')}
                options={[
                  { value: '', label: t('account_usage.allSources') },
                  ...['business', 'model_test', 'probe'].map((value) => ({
                    value,
                    label: t(`account_usage.source_${value}`),
                  })),
                ]}
                onChange={(value) => {
                  setSource(value);
                  setCursors([0]);
                }}
              />
              {mode === 'custom' && (
                <>
                  <Input
                    type="datetime-local"
                    label={t('account_usage.from')}
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setCursors([0]);
                    }}
                  />
                  <Input
                    type="datetime-local"
                    label={t('account_usage.to')}
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setCursors([0]);
                    }}
                  />
                </>
              )}
            </div>
            <div className={styles.row}>
              <span>{model || t('account_usage.allModels')}</span>
              <div className={styles.toolbar}>
                {model && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setModel('');
                      setCursors([0]);
                    }}
                  >
                    {t('account_usage.allModels')}
                  </Button>
                )}
                <Button size="sm" variant="secondary" disabled={loading || busy} onClick={refresh}>
                  {t('common.refresh')}
                </Button>
              </div>
            </div>
            {error && (
              <p role="alert" className={styles.warning}>
                {error}
              </p>
            )}
            {loading ? (
              <LoadingSpinner />
            ) : (
              result &&
              !error && (
                <>
                  <div className={styles.row}>
                    <strong>
                      {t('account_usage.periodCost')}: {totalMoney(result.summary)}
                    </strong>
                    <span>
                      {t('account_usage.requestCount', { count: result.summary.requests })}
                    </span>
                  </div>
                  {result.summary.unpriced > 0 && (
                    <p className={styles.warning}>
                      {t('account_usage.unpriced', { count: result.summary.unpriced })}
                    </p>
                  )}
                  {(result.status.error || result.status.dropped > 0) && (
                    <p className={styles.warning}>{t('account_usage.incompleteHistory')}</p>
                  )}
                  <p className={styles.hint}>
                    {t('account_usage.historyHint', {
                      time: dateLabel(result.status.captureSince),
                      days: result.status.retentionDays,
                    })}
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          {[
                            'model',
                            'requests',
                            'input',
                            'cacheRead',
                            'cacheWrite',
                            'output',
                            'cost',
                          ].map((key) => (
                            <th key={key}>{t(`account_usage.${key}`)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.models.map((m) => (
                          <tr key={m.provider + ':' + m.model}>
                            <td className={styles.model}>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setModel(m.model);
                                  setCursors([0]);
                                }}
                              >
                                {m.model}
                              </Button>
                            </td>
                            <td>{m.requests.toLocaleString()}</td>
                            <td>{m.input.toLocaleString()}</td>
                            <td>{m.cacheRead.toLocaleString()}</td>
                            <td>{m.cacheWrite.toLocaleString()}</td>
                            <td>{m.output.toLocaleString()}</td>
                            <td>
                              {totalMoney(m)}
                              {m.unpriced > 0 && (
                                <div className={styles.warning}>
                                  {t('account_usage.unpriced', { count: m.unpriced })}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.hint}>{t('account_usage.tokenHint')}</p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          {[
                            'time',
                            'model',
                            'source',
                            'transport',
                            'input',
                            'cacheRead',
                            'cacheWrite',
                            'output',
                            'costDetail',
                          ].map((key) => (
                            <th key={key}>{t(`account_usage.${key}`)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.records.map((r) => (
                          <tr key={r.executionId}>
                            <td>
                              {dateLabel(r.requestedAt)}
                              {r.failed && (
                                <div className={styles.warning}>{t('account_usage.failed')}</div>
                              )}
                            </td>
                            <td className={styles.model}>{r.pricingModel}</td>
                            <td>
                              {t(`account_usage.source_${r.source}`, { defaultValue: r.source })}
                            </td>
                            <td>
                              {r.transport === 'websocket'
                                ? 'WebSocket'
                                : r.transport === 'http'
                                  ? 'HTTP'
                                  : '—'}
                              {r.stream && (
                                <div className={styles.hint}>{t('account_usage.stream')}</div>
                              )}
                            </td>
                            <td>{r.input.toLocaleString()}</td>
                            <td>{r.cacheRead.toLocaleString()}</td>
                            <td>{r.cacheWrite.toLocaleString()}</td>
                            <td>{r.output.toLocaleString()}</td>
                            <td>
                              <RecordBreakdown row={r} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.records.length === 0 && (
                    <p className={styles.hint}>{t('account_usage.empty')}</p>
                  )}
                  <div className={styles.row}>
                    <Button
                      variant="secondary"
                      disabled={cursors.length === 1}
                      onClick={() => setCursors((c) => c.slice(0, -1))}
                    >
                      {t('account_usage.previous')}
                    </Button>
                    <span>{cursors.length}</span>
                    <Button
                      variant="secondary"
                      disabled={!result.nextCursor}
                      onClick={() => setCursors((c) => [...c, result.nextCursor])}
                    >
                      {t('account_usage.next')}
                    </Button>
                  </div>
                </>
              )
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
