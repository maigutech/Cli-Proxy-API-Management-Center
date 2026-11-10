import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconLoader2 } from '@/components/ui/icons';
import type { CodexAccessTokenState, CodexAccessTokenForm } from '../hooks/useCodexAccessTokenImport';
import { CODEX_PLAN_TYPES } from '../hooks/useCodexAccessTokenImport';
import { DialogTitle, type DialogHeading } from './OAuthFlowDialog';
import dialogStyles from './OAuthFlowDialog.module.scss';

export interface CodexAccessTokenDialogProps {
  open: boolean;
  heading: DialogHeading;
  state: CodexAccessTokenState;
  onFieldChange: (field: keyof CodexAccessTokenForm, value: string) => void;
  onImport: () => void;
  onImportAnother: () => void;
  onViewAuthFiles: () => void;
  onClose: () => void;
}

export function CodexAccessTokenDialog({
  open,
  heading,
  state,
  onFieldChange,
  onImport,
  onImportAnother,
  onViewAuthFiles,
  onClose,
}: CodexAccessTokenDialogProps) {
  const { t } = useTranslation();
  const result = state.result;
  const planFieldId = useId();
  // Plan names are product names, so they read the same in every locale.
  const planOptions = CODEX_PLAN_TYPES.map((plan) => ({
    value: plan,
    label: plan.charAt(0).toUpperCase() + plan.slice(1),
  }));

  const resultRows = result
    ? [
        { key: 'result_name', value: result.name },
        { key: 'result_account', value: result.accountId },
        { key: 'result_email', value: result.email },
        { key: 'result_plan', value: result.planType },
        { key: 'result_expires', value: result.expiresAt },
      ].filter((row): row is { key: string; value: string } => Boolean(row.value))
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={500}
      className={dialogStyles.dialog}
      title={<DialogTitle {...heading} />}
    >
      <div className={dialogStyles.view} key={result ? 'result' : 'form'}>
        {result ? (
          <div className={dialogStyles.result} role="status">
            <svg className={dialogStyles.successMark} viewBox="0 0 52 52" aria-hidden="true">
              <circle className={dialogStyles.successRing} cx="26" cy="26" r="24" />
              <path className={dialogStyles.successCheck} d="M16 27l7 7 14-15" />
            </svg>
            <div className={dialogStyles.resultTitle}>{t('codex_access_token.result_title')}</div>
            {resultRows.length > 0 && (
              <dl>
                {resultRows.map((row) => (
                  <div key={row.key}>
                    <dt>{t(`codex_access_token.${row.key}`)}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className={dialogStyles.resultActions}>
              <button type="button" className={dialogStyles.secondary} onClick={onViewAuthFiles}>
                {t('auth_login.view_auth_files')}
              </button>
              <button type="button" className={dialogStyles.primary} onClick={onImportAnother}>
                {t('codex_access_token.import_another')}
              </button>
            </div>
          </div>
        ) : (
          <div className={dialogStyles.stack}>
            <p className={dialogStyles.hint}>{t('codex_access_token.description')}</p>

            <Input
              label={t('codex_access_token.token_label')}
              hint={t('codex_access_token.token_hint')}
              value={state.accessToken}
              onChange={(event) => onFieldChange('accessToken', event.target.value)}
              placeholder={t('codex_access_token.token_placeholder')}
              spellCheck={false}
              autoComplete="off"
            />

            <Input
              label={t('codex_access_token.account_label')}
              hint={t('codex_access_token.account_hint')}
              value={state.accountId}
              onChange={(event) => onFieldChange('accountId', event.target.value)}
              placeholder={t('codex_access_token.account_placeholder')}
              spellCheck={false}
              autoComplete="off"
            />

            <div className="form-group">
              <label htmlFor={planFieldId}>{t('codex_access_token.plan_label')}</label>
              <Select
                id={planFieldId}
                value={state.planType}
                options={planOptions}
                onChange={(value) => onFieldChange('planType', value)}
                placeholder={t('codex_access_token.plan_placeholder')}
                ariaLabel={t('codex_access_token.plan_label')}
                fullWidth
              />
              <div className="hint">{t('codex_access_token.plan_hint')}</div>
            </div>

            <Input
              label={t('codex_access_token.email_label')}
              value={state.email}
              onChange={(event) => onFieldChange('email', event.target.value)}
              placeholder={t('codex_access_token.email_placeholder')}
              spellCheck={false}
              autoComplete="off"
            />

            <Input
              label={t('codex_access_token.proxy_label')}
              hint={t('codex_access_token.proxy_hint')}
              value={state.proxyUrl}
              onChange={(event) => onFieldChange('proxyUrl', event.target.value)}
              placeholder={t('codex_access_token.proxy_placeholder')}
              spellCheck={false}
              autoComplete="off"
            />

            {state.error && (
              <div className={dialogStyles.alert} role="alert">
                {state.error}
              </div>
            )}

            <div>
              <button
                type="button"
                className={dialogStyles.primary}
                onClick={onImport}
                disabled={!state.accessToken.trim() || state.loading}
              >
                {state.loading && (
                  <IconLoader2 size={14} className={dialogStyles.spinning} aria-hidden="true" />
                )}
                {t('codex_access_token.import_button')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
