import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthStore, useNotificationStore } from '@/stores';
import {
  captureUsageApi,
  type ModelPrice,
  type ModelPriceRates,
} from '@/services/api/accountUsage';
import { PriceSyncPanel } from './PriceSyncPanel';
import { dateLabel, money } from './format';
import styles from './Usage.module.scss';

const rateKeys = [
  'input',
  'cacheRead',
  'cacheWrite',
  'cacheWrite30m',
  'cacheWrite12h',
  'output',
] as const;
type RateDraft = Record<keyof ModelPriceRates, string>;
const draftRates = (rates?: ModelPriceRates | null): RateDraft =>
  Object.fromEntries(
    rateKeys.map((key) => [key, rates?.[key] == null ? '' : String(rates[key])])
  ) as RateDraft;
function parseRates(draft: RateDraft): ModelPriceRates | null {
  if (!draft.input.trim() || !draft.output.trim()) return null;
  const result = Object.fromEntries(
    rateKeys.map((key) => [key, draft[key].trim() === '' ? null : Number(draft[key])])
  );
  if (
    Object.values(result).some((n) => n !== null && (!Number.isFinite(n) || n < 0 || n > 1000000))
  )
    return null;
  return result as unknown as ModelPriceRates;
}
export function ModelPricesSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { showConfirmation } = useNotificationStore();
  const [api] = useState(captureUsageApi);
  useAuthStore((s) => s.apiBase);
  useAuthStore((s) => s.managementKey);
  const [prices, setPrices] = useState<ModelPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('default');
  const [selected, setSelected] = useState<ModelPrice | null>(null);
  const [model, setModel] = useState('');
  const [tier, setTier] = useState('default');
  const [rates, setRates] = useState<RateDraft>(draftRates);
  const [longRates, setLongRates] = useState<RateDraft>(draftRates);
  const [threshold, setThreshold] = useState('0');
  const [editor, setEditor] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editor) editorRef.current?.scrollIntoView({ block: 'start' });
  }, [editor, selected]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retention, setRetention] = useState('90');
  const [savedRetention, setSavedRetention] = useState(90);
  const [revision, setRevision] = useState(0);
  const stale = !api.isCurrent();
  const tiers = ['default', 'priority', 'flex', 'ultrafast', 'batch'];
  useEffect(() => {
    if (!api.isCurrent()) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    void api
      .prices(controller.signal)
      .then((data) => {
        if (active && api.isCurrent()) {
          setPrices(data.prices);
          setRetention(String(data.status.retentionDays));
          setSavedRetention(data.status.retentionDays);
        }
      })
      .catch((cause: unknown) => {
        if (active && api.isCurrent())
          setError(cause instanceof Error ? cause.message : t('account_usage.loadFailed'));
      })
      .finally(() => {
        if (active && api.isCurrent()) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, revision, t]);

  const confirmDiscard = () =>
    (!dirty && Number(retention) === savedRetention) ||
    stale ||
    new Promise<boolean>((resolve) =>
      showConfirmation({
        title: t('providersPage.unsavedChanges.title'),
        message: t('providersPage.unsavedChanges.message'),
        variant: 'danger',
        confirmText: t('providersPage.unsavedChanges.discard'),
        cancelText: t('providersPage.unsavedChanges.keepEditing'),
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      })
    );
  const edit = async (price: ModelPrice | null) => {
    if (!(await confirmDiscard())) return;
    setSelected(price);
    setModel(price?.model ?? '');
    setTier(price?.tier ?? 'default');
    setRates(draftRates(price?.rates));
    setLongRates(draftRates(price?.longContext));
    setThreshold(String(price?.longContextThreshold ?? 0));
    setEditor(true);
    setDirty(false);
    setError('');
  };
  const save = async () => {
    const parsed = parseRates(rates);
    const boundary = Number(threshold);
    const hasLongRates = Object.values(longRates).some((value) => value.trim() !== '');
    const parsedLong = boundary > 0 && hasLongRates ? parseRates(longRates) : null;
    if (
      !model.trim() ||
      !parsed ||
      !Number.isInteger(boundary) ||
      boundary < 0 ||
      boundary > 10000000 ||
      (boundary > 0 && hasLongRates && !parsedLong)
    ) {
      setError(t('account_usage.invalidPrice'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const price = await api.savePrice({
        version: selected?.version ?? 0,
        provider: selected?.provider ?? 'openai',
        model: model.trim(),
        tier,
        rates: parsed,
        longContextThreshold: boundary,
        longContext: parsedLong,
        source: 'manual',
        sourceUrl: '',
        effectiveAt: '',
      });
      if (api.isCurrent()) {
        setSelected(price);
        setDirty(false);
        setEditor(false);
        setRevision((v) => v + 1);
      }
    } catch (cause) {
      if (api.isCurrent())
        setError(cause instanceof Error ? cause.message : t('account_usage.saveFailed'));
    } finally {
      if (api.isCurrent()) setSaving(false);
    }
  };
  const saveRetention = async () => {
    const days = Number(retention);
    if (!Number.isInteger(days) || days < 7 || days > 3650) {
      setError(t('account_usage.invalidRetention'));
      return;
    }
    if (days < savedRetention) {
      const ok = await new Promise<boolean>((resolve) =>
        showConfirmation({
          title: t('account_usage.retention'),
          message: t('account_usage.retentionWarning'),
          variant: 'danger',
          confirmText: t('common.save'),
          cancelText: t('common.cancel'),
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        })
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      await api.retention(days);
      if (api.isCurrent()) {
        setSavedRetention(days);
        setError('');
      }
    } catch (cause) {
      if (api.isCurrent())
        setError(cause instanceof Error ? cause.message : t('account_usage.saveFailed'));
    } finally {
      if (api.isCurrent()) setSaving(false);
    }
  };
  const rateFields = (draft: RateDraft, set: (v: RateDraft) => void) => (
    <div className={styles.rates}>
      {rateKeys.map((key) => (
        <Input
          key={key}
          type="number"
          min="0"
          step="any"
          value={draft[key]}
          label={t(`account_usage.${key}Rate`)}
          placeholder={t('account_usage.notConfigured')}
          disabled={saving || stale}
          onChange={(e) => {
            set({ ...draft, [key]: e.target.value });
            setDirty(true);
          }}
        />
      ))}
    </div>
  );
  const filtered = prices.filter(
    (p) =>
      p.model.toLowerCase().includes(search.toLowerCase()) && (!tierFilter || p.tier === tierFilter)
  );

  return (
    <Sheet
      open
      size="xl"
      title={t('account_usage.prices')}
      onClose={onClose}
      confirmClose={confirmDiscard}
      closeDisabled={saving && !stale}
    >
      <div className={styles.content}>
        <p className={styles.hint}>{t('account_usage.priceHint')}</p>
        {stale ? (
          <p role="alert" className={styles.warning}>
            {t('account_usage.connectionChanged')}
          </p>
        ) : (
          <>
            <PriceSyncPanel api={api} onPrices={setPrices} />
            {error && (
              <p role="alert" className={styles.warning}>
                {error}
              </p>
            )}
            <div className={styles.filters}>
              <Input
                value={search}
                label={t('account_usage.model')}
                placeholder={t('account_usage.searchModel')}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select
                value={tierFilter}
                ariaLabel={t('account_usage.tier')}
                options={[
                  { value: '', label: t('account_usage.allTiers') },
                  ...tiers.map((value) => ({ value, label: value })),
                ]}
                onChange={setTierFilter}
              />
            </div>
            <Button variant="secondary" disabled={saving} onClick={() => void edit(null)}>
              {t('account_usage.addPrice')}
            </Button>
            {editor && (
              <div className={styles.section} ref={editorRef}>
                <div className={styles.filters}>
                  <Input
                    label={t('account_usage.model')}
                    value={model}
                    disabled={saving || Boolean(selected)}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setDirty(true);
                    }}
                  />
                  <Select
                    value={tier}
                    ariaLabel={t('account_usage.tier')}
                    options={tiers.map((value) => ({ value, label: value }))}
                    disabled={saving || Boolean(selected)}
                    onChange={(value) => {
                      setTier(value);
                      setDirty(true);
                    }}
                  />
                </div>
                {rateFields(rates, setRates)}
                <Input
                  label={t('account_usage.longThreshold')}
                  type="number"
                  min="0"
                  step="1"
                  value={threshold}
                  disabled={saving}
                  onChange={(e) => {
                    setThreshold(e.target.value);
                    setDirty(true);
                  }}
                />
                {Number(threshold) > 0 && (
                  <>
                    <span>{t('account_usage.longPrices')}</span>
                    {rateFields(longRates, setLongRates)}
                  </>
                )}
                <div className={styles.toolbar}>
                  <Button disabled={saving} onClick={() => void save()}>
                    {t('common.save')}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() =>
                      void Promise.resolve(confirmDiscard()).then((ok) => {
                        if (ok) {
                          setEditor(false);
                          setDirty(false);
                        }
                      })
                    }
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {[
                        'model',
                        'tier',
                        'inputRate',
                        'cacheReadRate',
                        'outputRate',
                        'priceSource',
                        'effectiveAt',
                        'edit',
                      ].map((key) => (
                        <th key={key}>{t(`account_usage.${key}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.version}>
                        <td className={styles.model}>
                          {p.model}
                          {p.longContextThreshold > 0 && (
                            <div className={styles.hint}>
                              {t('account_usage.contextBoundary', {
                                count: p.longContextThreshold,
                              })}
                            </div>
                          )}
                        </td>
                        <td>{p.tier}</td>
                        <td>{money(p.rates.input)}</td>
                        <td>{money(p.rates.cacheRead)}</td>
                        <td>{money(p.rates.output)}</td>
                        <td title={p.sourceUrl}>
                          {t(
                            p.source === 'manual'
                              ? 'account_usage.manualPrice'
                              : p.source === 'remote'
                                ? 'account_usage.remotePrice'
                                : 'account_usage.builtinPrice'
                          )}
                          {p.sourceUrl.startsWith('sub2api_') && (
                            <div className={styles.hint}>sub2api</div>
                          )}
                        </td>
                        <td>{dateLabel(p.effectiveAt)}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={saving}
                            onClick={() => void edit(p)}
                          >
                            {t('account_usage.edit')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className={styles.section}>
              <Input
                type="number"
                min="7"
                max="3650"
                label={t('account_usage.retention')}
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
                disabled={saving}
              />
              <Button
                variant="secondary"
                disabled={saving || Number(retention) === savedRetention}
                onClick={() => void saveRetention()}
              >
                {t('account_usage.saveRetention')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
