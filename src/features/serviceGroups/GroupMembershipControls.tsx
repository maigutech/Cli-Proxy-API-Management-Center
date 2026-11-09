import { useTranslation } from 'react-i18next';
import type { GroupBoard } from '@/services/api/serviceGroups';
import { UNASSIGNED_GROUP, type GroupLabel } from './membership';
import styles from './GroupMembershipControls.module.scss';

export function GroupMembershipFilter({
  board,
  value,
  onChange,
  counts,
  error,
  loading,
}: {
  board: GroupBoard | null;
  value: string;
  onChange: (id: string) => void;
  counts: Record<string, number>;
  error: string;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (error)
    return (
      <p className={styles.error} role="alert">
        {t('service_groups.membershipLoadFailed')}: {error}
      </p>
    );
  if (loading && !board)
    return (
      <p role="status" className={styles.note}>
        {t('service_groups.membershipLoading')}
      </p>
    );
  if (board?.mode !== 'grouped') return null;
  const groups = board.groups.filter((g) => !g.archived);
  const options = [
    { id: '', name: t('service_groups.allGroups') },
    ...groups,
    ...(value && value !== UNASSIGNED_GROUP && !groups.some((g) => g.id === value)
      ? [{ id: value, name: t('service_groups.groupUnavailable') }]
      : []),
    { id: UNASSIGNED_GROUP, name: t('service_groups.unassigned') },
  ];
  return (
    <div className={styles.filter}>
      <div className={styles.tabs} role="group" aria-label={t('service_groups.filterGroup')}>
        {options.map((group) => (
          <button
            type="button"
            key={group.id}
            aria-pressed={value === group.id}
            onClick={() => onChange(group.id)}
          >
            {group.name}
            <span>{counts[group.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <p className={styles.note}>{t('service_groups.membershipHint')}</p>
    </div>
  );
}

export function GroupMembershipBadges({ groups }: { groups: GroupLabel[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.badges} aria-label={t('service_groups.belongsTo')}>
      {groups.length ? (
        groups.map((g) => <span key={g.id}>{g.name}</span>)
      ) : (
        <span className={styles.unassigned}>{t('service_groups.unassigned')}</span>
      )}
      {groups.length > 1 && <small>{t('service_groups.sharedAccount')}</small>}
    </div>
  );
}
