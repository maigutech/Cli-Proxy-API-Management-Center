import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import {
  cyberSessionBlockApi,
  type CyberBlockedSession,
  type CyberSessionBlockSettings,
} from '@/services/api/cyberSessionBlock';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import { formatDateTimeValue } from '@/utils/format';
import styles from './CyberSessionBlockPage.module.scss';

const POLL_MS = 30_000;

function sessionState(row: CyberBlockedSession): 'blocked' | 'expired' | 'observing' {
  if (row.blocked) return 'blocked';
  if (row.expiresAt) return 'expired';
  return 'observing';
}

export function CyberSessionBlockPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [settings, setSettings] = useState<CyberSessionBlockSettings>({
    enabled: false,
    ttlMinutes: 30,
    threshold: 1,
  });
  const [draft, setDraft] = useState<CyberSessionBlockSettings>(settings);
  const [sessions, setSessions] = useState<CyberBlockedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    const view = await cyberSessionBlockApi.get();
    setSessions(view.sessions);
    setSettings(view.settings);
    // Only overwrite the editable draft when the operator has no unsaved edits.
    if (!dirtyRef.current) setDraft(view.settings);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const setDraftField = (patch: Partial<CyberSessionBlockSettings>) => {
    dirtyRef.current = true;
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await cyberSessionBlockApi.updateSettings({
        enabled: draft.enabled,
        ttlMinutes: Math.max(1, Math.floor(draft.ttlMinutes) || 30),
        threshold: Math.max(1, Math.floor(draft.threshold) || 1),
      });
      dirtyRef.current = false;
      showNotification(t('cyber_block.save_ok'), 'success');
      await load();
    } catch (err: unknown) {
      showNotification(`${t('cyber_block.save_failed')}: ${getErrorMessage(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const blockedCount = sessions.filter((s) => s.blocked).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('cyber_block.title')}</h1>
        <p className={styles.subtitle}>{t('cyber_block.subtitle')}</p>
      </header>

      <Card title={t('cyber_block.settings_title')}>
        <div className={styles.settings}>
          <ToggleSwitch
            checked={draft.enabled}
            onChange={(v) => setDraftField({ enabled: v })}
            label={t('cyber_block.enabled_label')}
          />
          <div className={styles.field}>
            <Input
              label={t('cyber_block.ttl_label')}
              hint={t('cyber_block.ttl_hint')}
              type="number"
              min={1}
              value={String(draft.ttlMinutes)}
              onChange={(e) => setDraftField({ ttlMinutes: Number(e.target.value) })}
            />
          </div>
          <div className={styles.field}>
            <Input
              label={t('cyber_block.threshold_label')}
              hint={t('cyber_block.threshold_hint')}
              type="number"
              min={1}
              value={String(draft.threshold)}
              onChange={(e) => setDraftField({ threshold: Number(e.target.value) })}
            />
          </div>
          <div className={styles.saveRow}>
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
              {t('cyber_block.save')}
            </Button>
          </div>
        </div>
        <p className={styles.note}>{t('cyber_block.note')}</p>
      </Card>

      <Card
        title={t('cyber_block.table_title')}
        extra={
          <span className={styles.counts}>
            {t('cyber_block.blocked_count', { count: blockedCount })} ·{' '}
            {t('cyber_block.total_count', { count: sessions.length })}
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {t('cyber_block.refresh')}
            </Button>
          </span>
        }
      >
        {sessions.length === 0 ? (
          <EmptyState
            title={loading ? t('cyber_block.loading') : t('cyber_block.empty_title')}
            description={loading ? '' : t('cyber_block.empty_desc')}
          />
        ) : (
          <Table cols={['22%', '8%', '12%', '14%', '', '16%']}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cyber_block.col_session')}</TableHead>
                <TableHead>{t('cyber_block.col_hits')}</TableHead>
                <TableHead>{t('cyber_block.col_state')}</TableHead>
                <TableHead>{t('cyber_block.col_code')}</TableHead>
                <TableHead>{t('cyber_block.col_message')}</TableHead>
                <TableHead>{t('cyber_block.col_expires')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((row) => {
                const state = sessionState(row);
                return (
                  <TableRow key={row.sessionId}>
                    <TableCell>
                      <span className={styles.session} title={row.sessionId}>
                        {row.sessionId}
                      </span>
                    </TableCell>
                    <TableCell>{row.hits}</TableCell>
                    <TableCell>
                      <span className={`${styles.badge} ${styles[`state_${state}`]}`}>
                        {t(`cyber_block.state_${state}`)}
                      </span>
                    </TableCell>
                    <TableCell>{row.lastCode || '—'}</TableCell>
                    <TableCell>
                      <span className={styles.message} title={row.lastMessage || ''}>
                        {row.lastMessage || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.blocked && row.expiresAt ? formatDateTimeValue(row.expiresAt) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
