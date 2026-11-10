import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { codexDegradationProbeApi } from '../src/services/api/codexDegradationProbe';

afterEach(() => mock.restore());

test('manual checks target the credential index through the management client', async () => {
  const post = spyOn(apiClient, 'post');
  post.mockResolvedValue({ started: true });
  expect(await codexDegradationProbeApi.run('selected-index')).toEqual({ started: true });
  expect(post).toHaveBeenCalledWith('/routing/codex-degradation-probe', {
    auth_index: 'selected-index',
  });
});

test('capacity failures are surfaced without retrying billable requests', async () => {
  const error = Object.assign(new Error('busy'), { status: 429 });
  const post = spyOn(apiClient, 'post');
  post.mockRejectedValue(error);
  await expect(codexDegradationProbeApi.run('selected-index')).rejects.toBe(error);
  expect(post).toHaveBeenCalledTimes(1);
});

test('failed status reads cannot turn a running probe into an empty result', async () => {
  const get = spyOn(apiClient, 'get');
  get.mockRejectedValue(new Error('disconnected'));
  await expect(codexDegradationProbeApi.get()).rejects.toThrow('disconnected');
});
