import type { GroupCredential, GroupModel, ServiceGroup } from '@/services/api/serviceGroups';

export function addableModels(existing: GroupModel[], candidates: string[]): string[] {
  const occupied = new Set(existing.flatMap((model) => [model.name.trim(), model.target]));
  return [...new Set(candidates)].filter((id) => id && id !== 'auto' && !occupied.has(id));
}

export function appendModels(existing: GroupModel[], selected: string[]): GroupModel[] {
  return [
    ...existing,
    ...addableModels(existing, selected).map((id) => ({ name: id, target: id })),
  ];
}

export const newGroup = (): ServiceGroup => ({
  id: '',
  name: '',
  note: '',
  enabled: false,
  archived: false,
  members: [],
  models: [],
  maxConcurrent: 0,
  allowAuto: false,
  keyId: '',
  keyPrefix: '',
  keyVersion: 0,
  keyAvailable: false,
});
export function supportedModels(group: ServiceGroup, credentials: GroupCredential[]): string[] {
  const ids = new Set(group.members.map((m) => m.credentialId));
  return [
    ...new Set(credentials.filter((c) => ids.has(c.id) && !c.conflict).flatMap((c) => c.models)),
  ].sort();
}
export function groupValidation(
  group: ServiceGroup,
  credentials: GroupCredential[]
): string | null {
  if (!group.name.trim()) return 'nameRequired';
  if (
    !Number.isInteger(group.maxConcurrent) ||
    group.maxConcurrent < 0 ||
    group.maxConcurrent > 100000
  )
    return 'invalidLimit';
  if (group.enabled && (!group.members.length || !group.models.length)) return 'emptyEnabled';
  const supported = new Set(supportedModels(group, credentials));
  const names = new Set<string>();
  for (const model of group.models) {
    if (!model.name.trim() || !model.target || names.has(model.name) || model.name === 'auto')
      return 'invalidModels';
    names.add(model.name);
    if (group.enabled && !supported.has(model.target)) return 'unsupportedModel';
  }
  for (const member of group.members) {
    if (!credentials.some((c) => c.id === member.credentialId && !c.conflict))
      return 'missingMember';
    if (
      member.weight !== undefined &&
      (!Number.isInteger(member.weight) || member.weight < 0 || member.weight > 1000000)
    )
      return 'invalidWeight';
  }
  return null;
}
