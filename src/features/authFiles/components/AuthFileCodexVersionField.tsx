import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';

interface AuthFileCodexVersionFieldProps {
  /** Currently pinned version; empty string means "follow the gateway default". */
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

/**
 * Per-account Codex version "face" selector. The options come from the gateway
 * (recent stable releases); an empty selection clears the pin so the account
 * follows the global default version.
 */
export function AuthFileCodexVersionField({
  value,
  disabled,
  onChange,
}: AuthFileCodexVersionFieldProps) {
  const { t } = useTranslation();
  const selectId = `${useId()}-codex-version`;
  const [versions, setVersions] = useState<string[]>([]);
  const [defaultVersion, setDefaultVersion] = useState('');

  useEffect(() => {
    let cancelled = false;
    void authFilesApi
      .getCodexVersions()
      .then((data) => {
        if (cancelled) return;
        setVersions(Array.isArray(data?.versions) ? data.versions.filter(Boolean) : []);
        setDefaultVersion(typeof data?.default === 'string' ? data.default : '');
      })
      .catch(() => {
        // Keep the dropdown usable even if the gateway list is unavailable: the
        // currently pinned value (if any) is still added below.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Always include the current value so a version no longer advertised by the
  // gateway does not silently vanish from the dropdown.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of [value.trim(), ...versions]) {
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }, [value, versions]);

  const followLabel = defaultVersion
    ? t('auth_files.codex_version_follow_default_with', { version: defaultVersion })
    : t('auth_files.codex_version_follow_default');

  return (
    <div className="form-group">
      <label htmlFor={selectId}>{t('auth_files.codex_version_label')}</label>
      <select
        id={selectId}
        className="input"
        value={value.trim()}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{followLabel}</option>
        {options.map((version) => (
          <option key={version} value={version}>
            {version}
          </option>
        ))}
      </select>
      <div className="hint">{t('auth_files.codex_version_hint')}</div>
    </div>
  );
}
