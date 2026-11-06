import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api/authFiles';
import { getErrorMessage } from '@/utils/helpers';
import { notifyAuthFilesChanged } from '@/features/authFiles/authFilesEvents';

export interface CodexAccessTokenResult {
  name?: string;
  accountId?: string;
  email?: string;
  planType?: string;
  expiresAt?: string;
}

export interface CodexAccessTokenForm {
  accessToken: string;
  accountId: string;
  email: string;
  proxyUrl: string;
}

export interface CodexAccessTokenState extends CodexAccessTokenForm {
  loading: boolean;
  error?: string;
  result?: CodexAccessTokenResult;
}

const EMPTY_FORM: CodexAccessTokenForm = {
  accessToken: '',
  accountId: '',
  email: '',
  proxyUrl: '',
};

/**
 * Register a Codex account from a static Codex Access Token (headless, no browser
 * OAuth). The credential has no refresh token, so it is used until it expires or
 * is revoked, then re-imported.
 */
export function useCodexAccessTokenImport(options: {
  isFocused: () => boolean;
  onCredentialAdded: () => void;
}) {
  const { isFocused, onCredentialAdded } = options;
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [state, setState] = useState<CodexAccessTokenState>({ ...EMPTY_FORM, loading: false });

  const setField = (field: keyof CodexAccessTokenForm, value: string) =>
    setState((prev) => ({ ...prev, [field]: value, error: undefined }));

  const importCredential = async () => {
    const accessToken = state.accessToken.trim();
    if (!accessToken) {
      setState((prev) => ({ ...prev, error: t('codex_access_token.token_required') }));
      return;
    }
    const proxyUrl = state.proxyUrl.trim();
    setState((prev) => ({ ...prev, loading: true, error: undefined, result: undefined }));
    try {
      const res = await authFilesApi.importCodexAccessToken({
        access_token: accessToken,
        account_id: state.accountId.trim() || undefined,
        email: state.email.trim() || undefined,
        proxy_url: proxyUrl || undefined,
      });
      const result: CodexAccessTokenResult = {
        name: res.name,
        accountId: res.account_id,
        email: res.email,
        planType: res.plan_type,
        expiresAt: res.expires_at,
      };
      setState((prev) => ({ ...prev, loading: false, result }));
      notifyAuthFilesChanged();
      onCredentialAdded();
      if (!isFocused()) showNotification(t('codex_access_token.success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: message || t('codex_access_token.failed'),
      }));
      if (!isFocused()) {
        showNotification(
          message ? `${t('codex_access_token.failed')}: ${message}` : t('codex_access_token.failed'),
          'error'
        );
      }
    }
  };

  /** After a successful import, keep the egress proxy (reused per account), clear the rest. */
  const resetForAnother = () =>
    setState((prev) => ({ ...EMPTY_FORM, proxyUrl: prev.proxyUrl, loading: false }));

  return { state, setField, importCredential, resetForAnother };
}
