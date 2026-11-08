import { useTranslation } from 'react-i18next';
import type { SessionRoutingSnapshot } from '@/services/api/sessionRouting';
import styles from './AccountOccupancy.module.scss';

export function AccountOccupancy({ snapshot }: { snapshot?: SessionRoutingSnapshot | null }) {
  const { t } = useTranslation();
  const metrics = [
    {
      label: 'requests',
      current: snapshot?.concurrentRequests,
      limit: snapshot?.effective.maxConcurrentRequests,
    },
    {
      label: 'sessions',
      current: snapshot?.activeSessions,
      limit: snapshot?.effective.maxActiveSessions,
    },
  ];
  return (
    <div
      className={styles.metrics}
      title={t(snapshot ? 'session_routing.card_hint' : 'session_routing.card_unknown')}
    >
      {metrics.map(({ label, current, limit }) => (
        <div
          key={label}
          aria-label={t(`session_routing.${label}`)}
          className={
            limit != null && limit > 0 && current != null && current >= limit ? styles.full : ''
          }
        >
          <span>{t(`session_routing.${label}Short`)}</span>
          <strong>
            {current ?? '—'} <span>/</span> {limit == null ? '—' : limit === 0 ? '∞' : limit}
          </strong>
        </div>
      ))}
    </div>
  );
}
