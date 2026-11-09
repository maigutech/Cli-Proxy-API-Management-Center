import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { IconFileText, IconRefreshCw, IconSearch } from '@/components/ui/icons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { apiClient } from '@/services/api/client';
import {
  captureRequestLogsApi,
  type RequestLogQuery,
  type RequestLogsResult,
} from '@/services/api/requestLogs';
import type { UsageRecord } from '@/services/api/accountUsage';
import { useAuthStore } from '@/stores';
import { dateLabel, money, totalMoney } from '@/features/usage/format';
import {
  buildLogQuery,
  compactNumber,
  defaultFilters,
  duration,
  logTimestamp,
  latency,
  pageQuery,
  type LogFilters,
} from './format';
import { RequestLogDetail } from './RequestLogDetail';
import { UNASSIGNED_GROUP } from '@/features/serviceGroups/membership';
import styles from './RequestLogsPage.module.scss';

export function RequestLogsPage() {
  // Recreate all local state when the authenticated connection changes.
  useAuthStore((s) => s.apiBase);
  useAuthStore((s) => s.managementKey);
  return <RequestLogsWorkspace key={apiClient.getConnectionRevision()} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      {children}
    </div>
  );
}

export function RequestLogStatus({ row }: { row: UsageRecord }) {
  const { t } = useTranslation();
  return (
    <span className={`${styles.badge} ${row.failed ? styles.failed : styles.success}`}>
      <span aria-hidden="true">●</span> {t(`request_logs.${row.failed ? 'failed' : 'success'}`)}
      {row.statusCode !== null ? ` · ${row.statusCode}` : ''}
    </span>
  );
}

export function RequestLogTable({
  records,
  accounts,
  groups = [],
  onDetail,
  onTrace,
}: {
  records: UsageRecord[];
  accounts: RequestLogsResult['accounts'];
  groups?: RequestLogsResult['groups'];
  onDetail: (row: UsageRecord) => void;
  onTrace: (id: string) => void;
}) {
  const { t } = useTranslation();
  const names = new Map(accounts.map((a) => [a.authIndex, a.name]));
  const groupNames = new Map(
    groups.map((g) => [
      g.id,
      `${g.name}${g.archived ? ` (${t('request_logs.archivedGroup')})` : ''}`,
    ])
  );
  return (
    <Table className={styles.table} aria-label={t('request_logs.title')}>
      <TableHeader>
        <TableRow>
          {[
            'time',
            'status',
            'requestId',
            'groupId',
            'account',
            'model',
            'type',
            'tokens',
            'cost',
            'latency',
            'details',
          ].map((key) => (
            <TableHead key={key}>{t(`request_logs.${key}`)}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((row) => {
          const id = row.traceId || row.executionId;
          const unknown = row.costStatus === 'usage_unknown';
          return (
            <TableRow key={row.executionId}>
              <TableCell>
                <time dateTime={row.requestedAt} className={styles.timestamp}>
                  {logTimestamp(row.requestedAt)}
                </time>
              </TableCell>
              <TableCell>
                <RequestLogStatus row={row} />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className={styles.trace}
                  title={`${t('request_logs.related')}: ${id}`}
                  aria-label={`${t('request_logs.related')}: ${id}`}
                  onClick={() => onTrace(id)}
                >
                  {id || '—'}
                </button>
              </TableCell>
              <TableCell>
                <span className={styles.account} title={row.groupId || undefined}>
                  {row.groupId
                    ? groupNames.get(row.groupId) || row.groupId
                    : t('request_logs.unassignedGroup')}
                </span>
              </TableCell>
              <TableCell>
                <span className={styles.account} title={names.get(row.authIndex) || row.authIndex}>
                  {names.get(row.authIndex) || row.authIndex}
                </span>
                <small className={styles.secondary}>{row.provider}</small>
              </TableCell>
              <TableCell>
                <span className={styles.model} title={row.pricingModel}>
                  {row.pricingModel || row.upstreamModel}
                </span>
                {row.serviceTier !== 'default' && (
                  <small className={styles.secondary}>{row.serviceTier}</small>
                )}
              </TableCell>
              <TableCell>
                <span className={styles.transport}>
                  {row.transport === 'http'
                    ? 'HTTP'
                    : row.transport === 'websocket'
                      ? 'WebSocket'
                      : '—'}{' '}
                  · {t(`request_logs.${row.stream ? 'streaming' : 'nonStreaming'}`)}
                </span>
                <small className={styles.secondary}>
                  {t(`account_usage.source_${row.source}`, { defaultValue: row.source })}
                </small>
              </TableCell>
              <TableCell>
                <div className={styles.tokens}>
                  <span
                    className={styles.inputTokens}
                    title={`${t('account_usage.input')}: ${unknown ? '—' : row.input.toLocaleString()}`}
                  >
                    ↓ {unknown ? '—' : compactNumber(row.input)}
                  </span>
                  <span
                    title={`${t('account_usage.output')}: ${unknown ? '—' : row.output.toLocaleString()}`}
                  >
                    ↑ {unknown ? '—' : compactNumber(row.output)}
                  </span>
                  <span
                    className={styles.cacheTokens}
                    title={`${t('account_usage.cacheRead')}: ${unknown ? '—' : row.cacheRead.toLocaleString()}`}
                  >
                    ↳ {unknown ? '—' : compactNumber(row.cacheRead)}
                  </span>
                  {row.cacheWrite > 0 && (
                    <span
                      className={styles.cacheWrite}
                      title={`${t('account_usage.cacheWrite')}: ${row.cacheWrite.toLocaleString()}`}
                    >
                      ✎ {compactNumber(row.cacheWrite)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span
                  className={styles.cost}
                  title={
                    row.cost
                      ? t('request_logs.costHint')
                      : t(`account_usage.status_${row.costStatus}`, {
                          defaultValue: t('account_usage.unknownCost'),
                        })
                  }
                >
                  {money(row.cost?.total)}
                </span>
              </TableCell>
              <TableCell>
                <span className={styles.transport}>
                  {t('request_logs.ttftShort')} {duration(row.ttftMs)}
                </span>
                <small className={styles.secondary}>
                  {t('request_logs.totalDuration')} {duration(latency(row))}
                </small>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDetail(row)}
                  aria-label={`${t('request_logs.details')} ${row.executionId}`}
                >
                  <IconFileText size={16} />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function RequestLogsWorkspace() {
  const { t } = useTranslation();
  const [api] = useState(captureRequestLogsApi);
  const [filters, setFilters] = useState<LogFilters>({ ...defaultFilters });
  const [applied, setApplied] = useState<LogFilters>({ ...defaultFilters });
  const [query, setQuery] = useState<RequestLogQuery>(() => buildLogQuery(defaultFilters)!);
  const [load, setLoad] = useState<{
    query: RequestLogQuery;
    result?: RequestLogsResult;
    error?: string;
  } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [selected, setSelected] = useState<UsageRecord | null>(null);
  const [jump, setJump] = useState('');
  const current = api.isCurrent();
  const pending = current && load?.query !== query;
  const data = current && load?.query === query ? load.result : undefined;
  const error = current && load?.query === query ? load.error : '';
  const facets = current ? load?.result : undefined;

  useEffect(() => {
    if (!api.isCurrent()) return;
    let active = true;
    const controller = new AbortController();
    void api
      .list(query, controller.signal)
      .then((result) => {
        if (active && api.isCurrent()) setLoad({ query, result });
      })
      .catch((cause: unknown) => {
        if (active && api.isCurrent())
          setLoad({
            query,
            error: cause instanceof Error ? cause.message : t('account_usage.loadFailed'),
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, query, t]);

  const apply = (next: LogFilters, pageSize = query.pageSize) => {
    setFilters(next);
    const nextQuery = buildLogQuery(next, pageSize);
    setInvalid(!nextQuery);
    if (!nextQuery) return;
    setApplied(next);
    setQuery(nextQuery);
    setSelected(null);
    setJump('');
  };
  const inline = (key: keyof LogFilters, value: string) => {
    const next = { ...filters, [key]: value };
    if (next.range === 'custom' && (!next.from || !next.to)) {
      setFilters(next);
      return;
    }
    apply(next);
  };
  const select = (key: keyof LogFilters, choices: Array<[string, string]>) => (
    <Select
      size="sm"
      ariaLabel={t(`request_logs.${key}`)}
      value={filters[key]}
      onChange={(value) => inline(key, value)}
      options={choices.map(([value, label]) => ({ value, label }))}
    />
  );
  const all = t('request_logs.all');
  const go = (page: number) => {
    if (!data || pending || !Number.isInteger(page) || page < 1 || page > data.totalPages) return;
    setQuery(pageQuery(query, page, data.snapshot));
    setJump('');
    setSelected(null);
  };
  const related = (id: string) =>
    apply({
      ...applied,
      authIndex: '',
      model: '',
      result: '',
      source: '',
      transport: '',
      stream: '',
      statusCode: '',
      requestId: id,
    });
  const moreCount = ['source', 'transport', 'stream', 'statusCode'].filter(
    (k) => filters[k as keyof LogFilters]
  ).length;
  const summary = data?.summary;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t('request_logs.title')}</h1>
          <p>{t('request_logs.subtitle')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending || !current}
          onClick={() => apply(applied)}
        >
          <IconRefreshCw size={14} /> {t('request_logs.refresh')}
        </Button>
      </header>
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          apply(filters);
        }}
      >
        <div className={styles.filterRow}>
          <Field label={t('request_logs.range')}>
            {select('range', [
              ['day', t('request_logs.last24h')],
              ['today', t('account_usage.todayRange')],
              ['week', t('account_usage.sevenRange')],
              ['custom', t('request_logs.custom')],
            ])}
          </Field>
          <Field label={t('request_logs.groupId')}>
            {select('groupId', [
              ['', t('service_groups.allGroups')],
              ...(facets?.groups ?? []).map((g): [string, string] => [
                g.id,
                `${g.name}${g.archived ? ` (${t('request_logs.archivedGroup')})` : ''}`,
              ]),
              [UNASSIGNED_GROUP, t('request_logs.unassignedGroup')],
            ])}
          </Field>
          <Field label={t('request_logs.account')}>
            {select('authIndex', [
              ['', t('request_logs.allAccounts')],
              ...(facets?.accounts ?? []).map((a): [string, string] => [a.authIndex, a.name]),
            ])}
          </Field>
          <Field label={t('request_logs.model')}>
            {select('model', [
              ['', t('request_logs.allModels')],
              ...(facets?.models ?? []).map((m): [string, string] => [m, m]),
            ])}
          </Field>
          <Field label={t('request_logs.status')}>
            {select('result', [
              ['', all],
              ['success', t('request_logs.success')],
              ['failed', t('request_logs.failed')],
            ])}
          </Field>
          <Input
            aria-label={t('request_logs.requestId')}
            placeholder={t('request_logs.searchPlaceholder')}
            value={filters.requestId}
            maxLength={256}
            onChange={(e) => setFilters({ ...filters, requestId: e.target.value })}
          />
          <Button type="submit" size="sm">
            <IconSearch size={14} /> {t('request_logs.search')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => apply({ ...defaultFilters })}
          >
            {t('request_logs.reset')}
          </Button>
        </div>
        {filters.range === 'custom' && (
          <div className={styles.dateRange}>
            <Input
              type="datetime-local"
              label={t('request_logs.from')}
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
            <Input
              type="datetime-local"
              label={t('request_logs.to')}
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
        )}
        <details className={styles.moreFilters}>
          <summary>
            {t('request_logs.moreFilters')}
            {moreCount > 0 && <span className={styles.count}>{moreCount}</span>}
          </summary>
          <div className={styles.filterRow}>
            <Field label={t('request_logs.source')}>
              {select('source', [
                ['', all],
                ...['business', 'model_test', 'probe'].map((s): [string, string] => [
                  s,
                  t(`account_usage.source_${s}`),
                ]),
              ])}
            </Field>
            <Field label={t('request_logs.transport')}>
              {select('transport', [
                ['', all],
                ['http', 'HTTP'],
                ['websocket', 'WebSocket'],
                ['unknown', t('request_logs.unknown')],
              ])}
            </Field>
            <Field label={t('request_logs.stream')}>
              {select('stream', [
                ['', all],
                ['true', t('request_logs.streaming')],
                ['false', t('request_logs.nonStreaming')],
              ])}
            </Field>
            <Input
              type="number"
              min={100}
              max={599}
              label={t('request_logs.statusCode')}
              placeholder="503"
              value={filters.statusCode}
              onChange={(e) => setFilters({ ...filters, statusCode: e.target.value })}
            />
          </div>
        </details>
        {invalid && (
          <p role="alert" className={styles.error}>
            {t('request_logs.invalidFilters')}
          </p>
        )}
      </form>
      <div className={styles.summary} aria-live="polite">
        <span className={styles.summaryLabel}>{t('request_logs.summary')}</span>
        <span>
          {t('request_logs.calls')}{' '}
          <strong>{summary ? summary.requests.toLocaleString() : '—'}</strong>
        </span>
        <span>
          {t('request_logs.success')}{' '}
          <strong className={styles.inputTokens}>
            {summary ? (summary.requests - summary.failed).toLocaleString() : '—'}
          </strong>
        </span>
        <span>
          {t('request_logs.failed')}{' '}
          <strong className={summary?.failed ? styles.error : ''}>
            {summary ? summary.failed.toLocaleString() : '—'}
          </strong>
        </span>
        <span>
          Token <strong>{summary ? compactNumber(summary.tokens) : '—'}</strong>
        </span>
        <span>
          {t('request_logs.cost')} <strong>{totalMoney(summary)}</strong>
        </span>
        {Boolean(summary?.unpriced) && (
          <span className={styles.error}>
            {t('request_logs.unpriced', { count: summary!.unpriced })}
          </span>
        )}
        <span className={styles.tokenLegend}>
          ↓ {t('account_usage.input')} · ↑ {t('account_usage.output')} · ↳{' '}
          {t('account_usage.cacheRead')}
        </span>
      </div>
      {!current && (
        <p role="alert" className={styles.error}>
          {t('account_usage.connectionChanged')}
        </p>
      )}
      {error && (
        <div role="alert" className={styles.empty}>
          <p>{error}</p>
          <Button size="sm" onClick={() => setQuery({ ...query })}>
            {t('request_logs.refresh')}
          </Button>
        </div>
      )}
      {pending ? (
        <div className={styles.empty} role="status">
          <LoadingSpinner />
          {t('request_logs.loading')}
        </div>
      ) : (
        data &&
        (data.records.length ? (
          <div className={styles.tableArea}>
            <RequestLogTable
              records={data.records}
              accounts={data.accounts}
              groups={data.groups}
              onDetail={setSelected}
              onTrace={related}
            />
          </div>
        ) : (
          <div className={styles.empty}>
            <IconFileText size={30} />
            <strong>{t('request_logs.empty')}</strong>
            <span>{t('request_logs.emptyHint')}</span>
          </div>
        ))
      )}
      <footer className={styles.footer}>
        <span>
          {data
            ? t('request_logs.pagination', {
                start: data.total ? (data.page - 1) * data.pageSize + 1 : 0,
                end: Math.min(data.page * data.pageSize, data.total),
                total: data.total,
              })
            : '—'}
        </span>
        <div className={styles.pager}>
          <Select
            size="sm"
            className={styles.pageSize}
            ariaLabel={t('request_logs.pageSize')}
            value={String(query.pageSize)}
            options={[25, 50, 100].map((n) => ({
              value: String(n),
              label: t('request_logs.perPage', { count: n }),
            }))}
            onChange={(v) => apply(applied, Number(v))}
            disabled={pending}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!data || data.page <= 1 || pending}
            onClick={() => go(data!.page - 1)}
          >
            {t('request_logs.previous')}
          </Button>
          <form
            className={styles.jump}
            onSubmit={(e) => {
              e.preventDefault();
              go(Number(jump));
            }}
          >
            <input
              type="number"
              min={1}
              max={data?.totalPages ?? 1}
              aria-label={t('request_logs.page')}
              value={jump || String(data?.page ?? query.page)}
              onChange={(e) => setJump(e.target.value)}
              disabled={!data || pending}
            />
            <span>/ {data?.totalPages ?? '—'}</span>
            <Button type="submit" variant="ghost" size="sm" disabled={!jump || !data || pending}>
              {t('request_logs.go')}
            </Button>
          </form>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data || data.page >= data.totalPages || pending}
            onClick={() => go(data!.page + 1)}
          >
            {t('request_logs.next')}
          </Button>
        </div>
      </footer>
      {data && (
        <details className={styles.coverage}>
          <summary>{t('request_logs.recordNotes')}</summary>
          <p>
            {t('request_logs.coverage', {
              since: dateLabel(data.status.captureSince),
              days: data.status.retentionDays,
            })}{' '}
            {t('request_logs.costHint')}
          </p>
          {data.status.pending > 0 && (
            <p>{t('request_logs.pending', { count: data.status.pending })}</p>
          )}
        </details>
      )}
      {data && (data.status.error || data.status.dropped > 0) && (
        <p role="alert" className={styles.error}>
          {t('request_logs.incomplete')}
        </p>
      )}
      {selected && current && (
        <Sheet
          open
          size="lg"
          title={t('request_logs.details')}
          eyebrow={selected.traceId || selected.executionId}
          onClose={() => setSelected(null)}
        >
          <RequestLogDetail
            row={selected}
            groupName={data?.groups.find((g) => g.id === selected.groupId)?.name}
            account={
              data?.accounts.find((a) => a.authIndex === selected.authIndex)?.name ||
              selected.authIndex
            }
            onTrace={() => related(selected.traceId || selected.executionId)}
          />
        </Sheet>
      )}
    </div>
  );
}
