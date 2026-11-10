import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CodexQuotaState, CodexWeeklyQuotaProtection } from '@/types';
import type { UsageQuota } from '@/services/api/accountUsage';
import { useNow } from '@/hooks/useNow';
import { dateLabel } from '@/features/usage/format';
import { compactCodexWindows, weeklyQuotaProtectionActive } from './codexQuotaSummary';
import styles from './CompactCodexQuota.module.scss';

export function CompactCodexQuota({
  quota,
  weekly,
  protection,
  refresh,
  details,
  error,
}: {
  quota?: CodexQuotaState;
  weekly?: UsageQuota | null;
  protection?: CodexWeeklyQuotaProtection;
  refresh: ReactNode;
  details?: ReactNode;
  error?: string;
}) {
  const { t } = useTranslation();
  const now = useNow();
  const windows = compactCodexWindows(quota, weekly, now, protection);
  const paused = weeklyQuotaProtectionActive(protection, now);
  return (
    <section className={styles.root} aria-label={t('account_usage.quotaUsage')}>
      <div className={styles.meters}>
        {windows.map((window) => {
          const label =
            window.id === 'five-hour'
              ? '5h'
              : window.id === 'weekly'
                ? '7d'
                : window.labelKey
                  ? t(window.labelKey, window.labelParams)
                  : window.label;
          const used =
            window.usedPercent == null ? null : Math.max(0, Math.min(100, window.usedPercent));
          const hint =
            used == null
              ? t('account_usage.quotaUnknown')
              : t('account_usage.percent', {
                  used: used.toFixed(1),
                  remaining: (100 - used).toFixed(1),
                });
          const reset =
            window.resetAtMs && Number.isFinite(window.resetAtMs)
              ? dateLabel(new Date(window.resetAtMs).toISOString())
              : window.resetLabel;
          return (
            <div
              key={window.id}
              className={styles.meter}
              title={`${hint}${reset ? ` · ${t('account_usage.resets')}: ${reset}` : ''}`}
            >
              <div className={styles.label}>
                <span>
                  {label} <span className={styles.muted}>{t('account_usage.usedShort')}</span>
                </span>
                <strong>{used == null ? '—' : `${Math.round(used)}%`}</strong>
              </div>
              <div
                className={`${styles.track} ${used == null ? styles.unknown : ''}`}
                role={used == null ? 'img' : 'meter'}
                aria-label={`${label} ${used == null ? hint : t('account_usage.usedShort')}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={used ?? undefined}
                aria-valuetext={hint}
              >
                {window.id === 'weekly' && protection && (
                  <i
                    className={styles.threshold}
                    style={{ left: `${protection.thresholdPercent}%` }}
                    aria-hidden="true"
                  />
                )}
                {used != null && (
                  <span
                    className={used >= 95 ? styles.high : used >= 80 ? styles.medium : styles.low}
                    style={{ width: `${used}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {protection && (
        <div className={`${styles.protection} ${paused ? styles.paused : ''}`} role="status">
          <span>
            {t(
              paused
                ? 'account_usage.weeklyProtectionPaused'
                : 'account_usage.weeklyProtectionLimit',
              { threshold: protection.thresholdPercent }
            )}
          </span>
          {paused && protection.resetsAt && (
            <span>
              {t('account_usage.weeklyProtectionReset', { time: dateLabel(protection.resetsAt) })}
            </span>
          )}
        </div>
      )}
      <div className={styles.footer}>
        {details && (
          <details className={styles.details}>
            <summary>{t('account_usage.quotaDetails')}</summary>
            <div className={styles.detailBody}>{details}</div>
          </details>
        )}
        {error && (
          <span role="status" className={styles.error} title={error}>
            {t('account_usage.quotaFailed')}
          </span>
        )}
        <div className={styles.refresh}>{refresh}</div>
      </div>
    </section>
  );
}
