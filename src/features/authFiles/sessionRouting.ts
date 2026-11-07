import {
  sessionRoutingFields,
  type SessionRoutingField,
  type SessionRoutingOverrides,
} from '@/services/api/sessionRouting';

export type SessionRoutingDraft = Record<SessionRoutingField, { inherit: boolean; value: string }>;
export const routingFields = Object.keys(sessionRoutingFields) as SessionRoutingField[];
export const maximumFor = (field: SessionRoutingField) =>
  field === 'maxActiveSessions' || field === 'maxConcurrentRequests' ? 1000000 : 2592000;
export const minimumFor = (field: SessionRoutingField) => (field === 'idleTtlSeconds' ? 1 : 0);

export function routingDraft(overrides: SessionRoutingOverrides): SessionRoutingDraft {
  return Object.fromEntries(
    routingFields.map((field) => [
      field,
      {
        inherit: overrides[field] === undefined,
        value: String(overrides[field] ?? minimumFor(field)),
      },
    ])
  ) as SessionRoutingDraft;
}
export function invalidRoutingFields(draft: SessionRoutingDraft): SessionRoutingField[] {
  return routingFields.filter((field) => {
    const { inherit, value } = draft[field];
    return (
      !inherit &&
      (!/^\d+$/.test(value.trim()) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < minimumFor(field) ||
        Number(value) > maximumFor(field))
    );
  });
}
export function routingOverrides(draft: SessionRoutingDraft): SessionRoutingOverrides {
  if (invalidRoutingFields(draft).length) throw new Error('Invalid session routing draft');
  return Object.fromEntries(
    routingFields
      .filter((field) => !draft[field].inherit)
      .map((field) => [field, Number(draft[field].value)])
  );
}
export function routingDirty(draft: SessionRoutingDraft, saved: SessionRoutingOverrides): boolean {
  if (invalidRoutingFields(draft).length) return true;
  const next = routingOverrides(draft);
  return routingFields.some((field) => next[field] !== saved[field]);
}
