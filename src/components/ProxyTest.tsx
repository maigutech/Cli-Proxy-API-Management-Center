import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { proxyApi, type ProxyTestResult } from '@/services/api/proxy';
import { IconAlertTriangle, IconCheckCircle2, IconLoader2 } from '@/components/ui/icons';
import styles from './ProxyTest.module.scss';

export interface ProxyTestProps {
  /** Current proxy URL value from the field this control sits under. */
  proxyUrl: string;
  disabled?: boolean;
}

/**
 * One-click proxy check: sends the current proxy URL to the server, which makes
 * one request through it and reports the exit IP / country / ISP / latency.
 * Used under the global proxy-url field and the per-account OAuth proxy field so
 * an operator can confirm the egress before committing an account to it.
 *
 * Disabled when the field is empty: an empty per-account proxy falls back to the
 * global one (not a direct connection), so testing "empty" would mislead.
 */
export function ProxyTest({ proxyUrl, disabled }: ProxyTestProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProxyTestResult | null>(null);

  const trimmed = proxyUrl.trim();
  const canTest = trimmed !== '' && !disabled && !loading;

  const runTest = async () => {
    if (!canTest) return;
    setLoading(true);
    setResult(null);
    const res = await proxyApi.test(trimmed);
    setResult(res);
    setLoading(false);
  };

  const geoLine = result?.ok
    ? [result.country, result.city, result.timezone].filter(Boolean).join(' · ')
    : '';

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void runTest()}
        disabled={!canTest}
        title={trimmed === '' ? t('proxy_test.empty_hint') : undefined}
      >
        {loading && <IconLoader2 size={13} className={styles.spin} aria-hidden="true" />}
        {loading ? t('proxy_test.testing') : t('proxy_test.button')}
      </button>

      {result && !loading && (
        <div
          className={result.ok ? styles.ok : styles.fail}
          role={result.ok ? 'status' : 'alert'}
        >
          {result.ok ? (
            <>
              <IconCheckCircle2 size={14} aria-hidden="true" />
              <span className={styles.body}>
                <span className={styles.primary}>
                  {result.exitIp || '?'}
                  {result.mode === 'direct' ? ` · ${t('proxy_test.direct')}` : ''}
                  {typeof result.latencyMs === 'number' ? ` · ${result.latencyMs}ms` : ''}
                </span>
                {(geoLine || result.org) && (
                  <span className={styles.meta}>
                    {[geoLine, result.org].filter(Boolean).join('  ·  ')}
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <IconAlertTriangle size={14} aria-hidden="true" />
              <span className={styles.body}>
                <span className={styles.primary}>{t('proxy_test.failed')}</span>
                {result.error && <span className={styles.meta}>{result.error}</span>}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
