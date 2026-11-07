import { apiClient } from './client';

export interface AccountTestRoute {
  source: 'account' | 'global' | 'environment';
  mode: 'proxy' | 'direct' | 'inherit' | 'invalid';
  endpoint: string;
  valid: boolean;
}
export interface AccountTestInfo {
  models: string[];
  route: AccountTestRoute;
  prompt: string;
  authIndex: string;
}
export interface AccountTestResult {
  success: boolean;
  model: string;
  authIndex: string;
  durationMs: number;
  route: AccountTestRoute;
  output: string;
  errorCode: string;
  httpStatus?: number;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid model test response');
  }
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid model test response');
  return value;
}
function route(value: unknown): AccountTestRoute {
  const data = record(value);
  if (
    !['account', 'global', 'environment'].includes(string(data.source)) ||
    !['proxy', 'direct', 'inherit', 'invalid'].includes(string(data.mode)) ||
    typeof data.valid !== 'boolean'
  )
    throw new Error('Invalid model test route');
  return {
    source: data.source as AccountTestRoute['source'],
    mode: data.mode as AccountTestRoute['mode'],
    endpoint: data.endpoint == null ? '' : string(data.endpoint),
    valid: data.valid,
  };
}
export function normalizeAccountTestInfo(value: unknown): AccountTestInfo {
  const data = record(value);
  if (!Array.isArray(data.models)) throw new Error('Invalid model test models');
  return {
    models: [...new Set(data.models.map(string))],
    route: route(data.route),
    prompt: string(data.prompt),
    authIndex: string(data.auth_index),
  };
}
export function normalizeAccountTestResult(value: unknown): AccountTestResult {
  const data = record(value);
  if (
    typeof data.success !== 'boolean' ||
    typeof data.duration_ms !== 'number' ||
    !Number.isFinite(data.duration_ms) ||
    data.duration_ms < 0 ||
    (data.http_status != null &&
      (typeof data.http_status !== 'number' || !Number.isInteger(data.http_status)))
  )
    throw new Error('Invalid model test result');
  return {
    success: data.success,
    model: string(data.model),
    authIndex: string(data.auth_index),
    durationMs: data.duration_ms,
    route: route(data.route),
    output: string(data.output),
    errorCode: data.error_code == null ? '' : string(data.error_code),
    httpStatus: data.http_status as number | undefined,
  };
}

export function captureAccountModelTestApi() {
  const revision = apiClient.getConnectionRevision();
  const client = apiClient.captureConnection();
  const isCurrent = () => apiClient.getConnectionRevision() === revision;
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('Connection changed; reopen the model test');
  };
  return {
    isCurrent,
    get: async (name: string, authIndex: string | undefined, signal: AbortSignal) => {
      assertCurrent();
      return normalizeAccountTestInfo(
        await client.get('/credentials/model-test', {
          params: { name, auth_index: authIndex },
          signal,
        })
      );
    },
    run: async (name: string, authIndex: string, model: string, signal: AbortSignal) => {
      assertCurrent();
      return normalizeAccountTestResult(
        await client.post(
          '/credentials/model-test',
          {
            name,
            auth_index: authIndex,
            model,
          },
          { signal, timeout: 0 }
        )
      );
    },
  };
}
