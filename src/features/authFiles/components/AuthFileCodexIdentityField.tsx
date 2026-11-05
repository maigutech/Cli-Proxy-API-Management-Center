import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';

// Known client identities, used as a fallback so the client dropdown stays
// usable even if the gateway's /credentials/codex-versions endpoint fails. The
// gateway remains the source of truth and overrides this on success.
const FALLBACK_ORIGINATORS = ['codex-tui', 'codex_cli_rs'];

interface AuthFileCodexIdentityFieldProps {
  /** Currently pinned client identity (originator); empty = follow the gateway default. */
  originator: string;
  /** Currently pinned version; empty = follow the gateway default. */
  version: string;
  disabled: boolean;
  onOriginatorChange: (value: string) => void;
  onVersionChange: (value: string) => void;
}

/**
 * Per-account Codex "face" selector: first pick the client identity
 * (codex-tui / codex_cli_rs), then its version. Options come from the gateway
 * (GET /credentials/codex-versions). An empty selection on either clears that
 * pin so the account follows the gateway default. The client identity is the
 * stronger lever on upstream overload; the version is a secondary adjustment.
 */
export function AuthFileCodexIdentityField({
  originator,
  version,
  disabled,
  onOriginatorChange,
  onVersionChange,
}: AuthFileCodexIdentityFieldProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [originators, setOriginators] = useState<string[]>(FALLBACK_ORIGINATORS);
  const [defaultOriginator, setDefaultOriginator] = useState('');
  const [versions, setVersions] = useState<string[]>([]);
  const [defaultVersion, setDefaultVersion] = useState('');

  useEffect(() => {
    let cancelled = false;
    void authFilesApi
      .getCodexVersions()
      .then((data) => {
        if (cancelled) return;
        const fetchedOriginators = Array.isArray(data?.originators)
          ? data.originators.filter(Boolean)
          : [];
        if (fetchedOriginators.length > 0) setOriginators(fetchedOriginators);
        setDefaultOriginator(
          typeof data?.default_originator === 'string' ? data.default_originator : ''
        );
        setVersions(Array.isArray(data?.versions) ? data.versions.filter(Boolean) : []);
        setDefaultVersion(typeof data?.default === 'string' ? data.default : '');
      })
      .catch(() => {
        // Keep the dropdowns usable even if the gateway list is unavailable: the
        // currently pinned values (if any) are still added below.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Always include the current value so a client/version no longer advertised by
  // the gateway does not silently vanish from its dropdown.
  const withCurrent = (current: string, list: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of [current.trim(), ...list]) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out;
  };

  const originatorOptions = useMemo(
    () => withCurrent(originator, originators),
    [originator, originators]
  );
  const versionOptions = useMemo(() => withCurrent(version, versions), [version, versions]);

  const clientFollowLabel = defaultOriginator
    ? t('auth_files.codex_client_follow_default_with', { client: defaultOriginator })
    : t('auth_files.codex_client_follow_default');
  const versionFollowLabel = defaultVersion
    ? t('auth_files.codex_version_follow_default_with', { version: defaultVersion })
    : t('auth_files.codex_version_follow_default');

  return (
    <>
      <div className="form-group">
        <label htmlFor={`${baseId}-client`}>{t('auth_files.codex_client_label')}</label>
        <select
          id={`${baseId}-client`}
          className="input"
          value={originator.trim()}
          disabled={disabled}
          onChange={(event) => onOriginatorChange(event.target.value)}
        >
          <option value="">{clientFollowLabel}</option>
          {originatorOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <div className="hint">{t('auth_files.codex_client_hint')}</div>
      </div>
      <div className="form-group">
        <label htmlFor={`${baseId}-version`}>{t('auth_files.codex_version_label')}</label>
        <select
          id={`${baseId}-version`}
          className="input"
          value={version.trim()}
          disabled={disabled}
          onChange={(event) => onVersionChange(event.target.value)}
        >
          <option value="">{versionFollowLabel}</option>
          {versionOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <div className="hint">{t('auth_files.codex_version_hint')}</div>
      </div>
    </>
  );
}
