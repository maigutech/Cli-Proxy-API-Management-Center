const SUPPORTED_PROXY_SCHEMES = new Set(['http:', 'https:', 'socks5:', 'socks5h:']);

export function isValidOAuthProxyUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;

  try {
    const parsed = new URL(value);
    if (!SUPPORTED_PROXY_SCHEMES.has(parsed.protocol) || !parsed.hostname) return false;
    if (parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) return false;
    const authority = value.slice(value.indexOf('//') + 2).split(/[/?#]/, 1)[0];
    const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
    const explicitPort = /:(\d+)$/.exec(hostPort)?.[1];
    const port = Number(explicitPort);
    return explicitPort !== undefined && Number.isInteger(port) && port >= 1 && port <= 65535;
  } catch {
    return false;
  }
}
