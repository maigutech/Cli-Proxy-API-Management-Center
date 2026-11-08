import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { UsageAccounts } from '@/services/api/accountUsage';
import { money, sumUsage } from './format';
import styles from './Usage.module.scss';

export function UsageOverview({
  data,
  error,
  disabled,
  onPrices,
}: {
  data?: UsageAccounts | null;
  error?: string;
  disabled: boolean;
  onPrices: () => void;
}) {
  const { t } = useTranslation();
  const accounts = Object.values(data?.accounts ?? {});
  const today = sumUsage(accounts.map((a) => a.today));
  const seven = sumUsage(accounts.map((a) => a.sevenDays));
  const amount = (total: typeof today) =>
    !data || (total.requests > 0 && !total.priced) ? '—' : money(total.cost);
  return (
    <section className={styles.overview} aria-label={t('account_usage.overview')}>
      <div className={styles.row}>
        <strong title={`${t('account_usage.filteredTotal')} ${t('account_usage.disclaimer')}`}>
          {t('account_usage.overview')}
        </strong>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={onPrices}>
          {t('account_usage.prices')}
        </Button>
      </div>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span>{t('account_usage.today')}</span>
          <strong>{amount(today)}</strong>
        </div>
        <div className={styles.metric}>
          <span>{t('account_usage.sevenDays')}</span>
          <strong>{amount(seven)}</strong>
        </div>
      </div>

      {seven.unpriced > 0 && (
        <span className={styles.warning}>
          {t('account_usage.unpriced', { count: seven.unpriced })}
        </span>
      )}
      {error && (
        <span role="alert" className={styles.warning}>
          {t('account_usage.loadFailed')}: {error}
        </span>
      )}
      {data && (!data.status.ready || data.status.error || data.status.dropped > 0) && (
        <span className={styles.warning}>{t('account_usage.incompleteHistory')}</span>
      )}
    </section>
  );
}
