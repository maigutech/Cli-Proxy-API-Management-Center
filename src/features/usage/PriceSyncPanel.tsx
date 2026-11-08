import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw } from '@/components/ui/icons';
import type { captureUsageApi, ModelPrice, PriceSyncStatus } from '@/services/api/accountUsage';
import { dateLabel } from './format';
import styles from './Usage.module.scss';

export function PriceSyncPanel({
  api,
  onPrices,
}: {
  api: ReturnType<typeof captureUsageApi>;
  onPrices: (prices: ModelPrice[]) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<PriceSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const lastSuccess = useRef('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (busy || !api.isCurrent()) return;
    let active = true;
    let epoch = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const stop = () => {
      epoch++;
      clearTimeout(timer);
      request?.abort();
    };
    const load = async () => {
      stop();
      if (!active || document.hidden || !api.isCurrent()) return;
      const version = epoch;
      const controller = new AbortController();
      request = controller;
      const current = () => active && version === epoch && api.isCurrent();
      let running = false;
      try {
        const next = await api.priceSyncStatus(controller.signal);
        if (!current()) return;
        setState(next);
        setError('');
        running = next.running;
        if (!running && next.lastSuccess && next.lastSuccess !== lastSuccess.current) {
          const data = await api.prices(controller.signal);
          if (!current()) return;
          onPrices(data.prices);
          lastSuccess.current = next.lastSuccess;
        }
      } catch (cause) {
        if (current())
          setError(cause instanceof Error ? cause.message : t('account_usage.loadFailed'));
      } finally {
        if (current()) timer = setTimeout(() => void load(), running ? 2000 : 10000);
      }
    };
    const visibility = () => {
      if (document.hidden) stop();
      else void load();
    };
    void load();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      stop();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [api, busy, onPrices, t]);
  const change = async (enabled?: boolean) => {
    setBusy(true);
    setError('');
    try {
      const next =
        enabled === undefined ? await api.syncPrices() : await api.setPriceSyncEnabled(enabled);
      if (mounted.current && api.isCurrent()) setState(next);
    } catch (cause) {
      if (mounted.current && api.isCurrent())
        setError(cause instanceof Error ? cause.message : t('account_usage.saveFailed'));
    } finally {
      if (mounted.current && api.isCurrent()) setBusy(false);
    }
  };
  return (
    <section className={styles.syncPanel} aria-label={t('account_usage.autoSync')}>
      <div className={styles.row}>
        <ToggleSwitch
          checked={state?.enabled ?? false}
          disabled={!state || busy}
          onChange={(value) => void change(value)}
          label={t('account_usage.autoSync')}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || state?.running}
          loading={busy || state?.running}
          onClick={() => void change()}
        >
          {!busy && !state?.running && <IconRefreshCw size={13} />}
          {t(state?.running ? 'account_usage.syncRunning' : 'account_usage.syncNow')}
        </Button>
      </div>
      <div className={styles.hint}>
        {t('account_usage.syncHint', { minutes: state?.intervalMinutes ?? 10 })}
      </div>
      {state && (
        <div
          className={styles.syncMeta}
          title={`${t('account_usage.priceSource')}: ${state.sourceUrl}`}
        >
          <span>
            {t('account_usage.syncChecked')}: {dateLabel(state.lastChecked)}
          </span>
          <span>
            {t('account_usage.syncUpdated')}: {dateLabel(state.lastUpdated)}
          </span>
          <span title={t('account_usage.syncSkippedHint')}>
            {t('account_usage.syncCounts', {
              count: state.catalogRows,
              skipped: state.skippedRows,
            })}
          </span>
        </div>
      )}
      {(error || state?.error) && (
        <div className={styles.warning} role="alert">
          {t('account_usage.syncFailed')}: {error || state?.error}
        </div>
      )}
    </section>
  );
}
