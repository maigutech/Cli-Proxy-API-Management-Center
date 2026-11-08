import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { AccountUsage } from '@/services/api/accountUsage';
import { dateLabel, money, totalMoney } from './format';
import styles from './Usage.module.scss';

export function AccountUsageCard({
  usage,
  onDetails,
  disabled = false,
}: {
  usage?: AccountUsage;
  onDetails?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const q = usage?.quota;
  return (
    <div className={styles.card}>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span>{t('account_usage.today')}</span>
          <strong>{totalMoney(usage?.today)}</strong>
        </div>
        <div className={styles.metric}>
          <span>{t('account_usage.sevenDays')}</span>
          <strong>{totalMoney(usage?.sevenDays)}</strong>
        </div>
      </div>
      {Boolean(usage?.sevenDays.unpriced) && (
        <span className={styles.warning}>
          {t('account_usage.unpriced', { count: usage?.sevenDays.unpriced })}
        </span>
      )}
      {q && (
        <div className={styles.quota}>
          <div className={styles.row}>
            <span>{t('account_usage.weekly')}</span>
            <span>
              {q.stale
                ? t('account_usage.stale')
                : t('account_usage.percent', {
                    used: q.usedPercent.toFixed(1),
                    remaining: q.remainingPercent.toFixed(1),
                  })}
            </span>
          </div>
          {!q.stale && (
            <progress
              className={styles.progress}
              max={100}
              value={q.usedPercent}
              aria-label={t('account_usage.weekly')}
            />
          )}
          <div className={styles.hint}>
            {t('account_usage.windowCost')}: {totalMoney(q.windowUsage)}
          </div>
          {q.estimatedRemaining !== null && !q.stale && (
            <div className={styles.hint}>
              {t('account_usage.remainingEstimate')}: {money(q.estimatedRemaining)}
            </div>
          )}
          <div className={styles.hint}>
            {t('account_usage.resets')}: {dateLabel(q.resetsAt)}
          </div>
        </div>
      )}
      {onDetails && (
        <Button size="sm" variant="secondary" disabled={disabled} onClick={onDetails}>
          {t('account_usage.details')}
        </Button>
      )}
    </div>
  );
}
