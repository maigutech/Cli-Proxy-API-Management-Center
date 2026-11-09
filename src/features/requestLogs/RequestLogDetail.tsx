import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { UsageRecord } from '@/services/api/accountUsage';
import { money } from '@/features/usage/format';
import { duration, latency, logTimestamp } from './format';
import styles from './RequestLogsPage.module.scss';

export function RequestLogDetail({
  row,
  account,
  groupName,
  onTrace,
}: {
  row: UsageRecord;
  account: string;
  groupName?: string;
  onTrace: () => void;
}) {
  const { t } = useTranslation();
  const rates = row.longContext ? row.price?.longContext : row.price?.rates;
  const unknown = row.costStatus === 'usage_unknown';
  const fields: Array<[string, string | number]> = [
    [
      t('request_logs.groupId'),
      row.groupId ? groupName || row.groupId : t('request_logs.unassignedGroup'),
    ],
    [t('request_logs.groupIdentity'), row.groupId || '—'],
    [t('request_logs.keyIdentity'), row.keyId || '—'],
    [t('request_logs.credentialIdentity'), row.credentialId || '—'],
    [t('request_logs.account'), account],
    [t('request_logs.authIndex'), row.authIndex],
    [t('request_logs.requestId'), row.traceId || '—'],
    [t('account_usage.execution'), row.executionId],
    [
      t('request_logs.status'),
      `${t(`request_logs.${row.failed ? 'failed' : 'success'}`)}${row.statusCode === null ? '' : ` · ${row.statusCode}`}`,
    ],
    [t('request_logs.time'), logTimestamp(row.requestedAt)],
    [t('request_logs.completedAt'), logTimestamp(row.completedAt)],
    [t('request_logs.ttft'), duration(row.ttftMs)],
    [t('request_logs.totalDuration'), duration(latency(row))],
    [t('request_logs.transport'), row.transport],
    [t('request_logs.type'), t(`request_logs.${row.stream ? 'streaming' : 'nonStreaming'}`)],
    [
      t('request_logs.source'),
      t(`account_usage.source_${row.source}`, { defaultValue: row.source }),
    ],
    [t('account_usage.requestedModel'), row.requestedModel],
    [t('account_usage.upstreamModel'), row.upstreamModel],
    [t('account_usage.responseModel'), row.responseModel || '—'],
    [t('request_logs.pricingModel'), row.pricingModel],
    [t('account_usage.tier'), row.serviceTier],
    [t('account_usage.priceVersion'), row.price?.version ?? '—'],
  ];
  return (
    <div className={styles.detail}>
      <div className={styles.detailTop}>
        <div>
          <small>{t('request_logs.cost')}</small>
          <strong>{money(row.cost?.total)}</strong>
        </div>
        <Button size="sm" variant="secondary" onClick={onTrace}>
          {t('request_logs.related')}
        </Button>
      </div>
      {!row.cost && (
        <p className={styles.error}>
          {t(`account_usage.status_${row.costStatus}`, {
            defaultValue: t('account_usage.unknownCost'),
          })}
        </p>
      )}
      <dl className={styles.facts}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>{t('request_logs.tokenBreakdown')}</h3>
      <div className={styles.breakdown}>
        <table>
          <thead>
            <tr>
              <th>{t('request_logs.type')}</th>
              <th>Token</th>
              <th>{t('request_logs.rate')}</th>
              <th>{t('request_logs.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'input', tokens: row.input, rate: rates?.input, cost: row.cost?.input },
              { label: 'output', tokens: row.output, rate: rates?.output, cost: row.cost?.output },
              {
                label: 'cacheRead',
                tokens: row.cacheRead,
                rate: rates?.cacheRead,
                cost: row.cost?.cacheRead,
              },
              {
                label: 'cacheWrite',
                tokens: row.cacheWrite,
                rate: rates?.cacheWrite,
                cost: row.cost?.cacheWrite,
              },
            ].map((bucket) => (
              <tr key={bucket.label}>
                <td>{t(`account_usage.${bucket.label}`)}</td>
                <td>{unknown ? '—' : bucket.tokens.toLocaleString()}</td>
                <td>{money(bucket.rate)}</td>
                <td>{money(bucket.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!unknown && (
        <p className={styles.note}>{t('request_logs.reasoningNote', { count: row.reasoning })}</p>
      )}
      {rates && (rates.cacheWrite30m !== null || rates.cacheWrite12h !== null) && (
        <p className={styles.note}>
          {t('account_usage.cacheWrite30mRate')}: {money(rates.cacheWrite30m)} ·{' '}
          {t('account_usage.cacheWrite12hRate')}: {money(rates.cacheWrite12h)}
        </p>
      )}
      <p className={styles.note}>
        {t('request_logs.groupAttributionHint')} {t('request_logs.costHint')}{' '}
        {t('request_logs.detailNote')}
      </p>
    </div>
  );
}
