import { expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import { runVisualConfig } from './helpers/visualConfig';
import { getVisualConfigValidationErrors } from '../src/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '../src/types/visualConfig';

test('weekly cap is editable globally without touching other configuration', () => {
  const yaml =
    'config-version: 8\noauth: {providers: {codex: {weekly-quota-limit-percent: 90}}}\nfuture: keep\n';
  const config = runVisualConfig(yaml, [{ codexWeeklyQuotaLimitPercent: '80' }]);
  const changed = parseDocument(config.applyVisualChangesToYaml(yaml));
  expect(changed.getIn(['oauth', 'providers', 'codex', 'weekly-quota-limit-percent'])).toBe(80);
  expect(changed.get('future')).toBe('keep');
  const defaults = runVisualConfig(yaml, [{ codexWeeklyQuotaLimitPercent: '' }]);
  expect(
    parseDocument(defaults.applyVisualChangesToYaml(yaml)).getIn([
      'oauth',
      'providers',
      'codex',
      'weekly-quota-limit-percent',
    ])
  ).toBeUndefined();
});

test('only whole percentages 1–100 and the empty default are valid', () => {
  const validate = (value: string) =>
    getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      codexWeeklyQuotaLimitPercent: value,
    }).codexWeeklyQuotaLimitPercent;
  for (const value of ['', '1', '80', '90', '100']) expect(validate(value)).toBeUndefined();
  for (const value of ['0', '-1', '101', '90.5', 'NaN', 'wrong'])
    expect(validate(value)).toBe('integer_range_1_100');
});
