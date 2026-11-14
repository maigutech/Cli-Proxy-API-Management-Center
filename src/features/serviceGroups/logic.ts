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
export type GroupIssueTab = 'overview' | 'members' | 'models' | 'policy';

/**
 * One problem with a group draft, located precisely enough to show next to
 * the field it concerns. Blocking issues are what the server would reject;
 * the rest are warnings about how the group will behave, and never stop a save.
 */
export interface GroupIssue {
  /** Message key under `service_groups`. */
  key: string;
  tab: GroupIssueTab;
  blocking: boolean;
  params?: Record<string, string | number>;
  /** Zero-based index of the model row the issue belongs to. */
  modelIndex?: number;
  modelField?: 'name' | 'target';
  credentialId?: string;
  field?: 'name' | 'maxConcurrent';
}

/**
 * Every issue with a draft, in the order the editor shows its tabs.
 *
 * A group may be saved, and enabled, before it has any accounts or models, the
 * way sub2api groups work: create it, hand out its key, then assign accounts.
 * Until then the server answers its requests with "no authorized credential"
 * (503) or "model not in this group" (404). Those are warnings here, as is a
 * model no member supports yet, so models can be set up before their accounts.
 */
export function groupIssues(group: ServiceGroup, credentials: GroupCredential[]): GroupIssue[] {
  const issues: GroupIssue[] = [];
  if (!group.name.trim())
    issues.push({ key: 'nameRequired', tab: 'overview', blocking: true, field: 'name' });

  const byId = new Map(credentials.map((c) => [c.id, c]));
  for (const member of group.members) {
    const credential = byId.get(member.credentialId);
    const name = credential?.name || member.credentialId;
    if (!credential || credential.conflict)
      issues.push({
        key: 'missingMember',
        tab: 'members',
        blocking: true,
        params: { name },
        credentialId: member.credentialId,
      });
    if (
      member.weight !== undefined &&
      (!Number.isInteger(member.weight) || member.weight < 0 || member.weight > 1000000)
    )
      issues.push({
        key: 'invalidWeight',
        tab: 'members',
        blocking: true,
        params: { name },
        credentialId: member.credentialId,
      });
  }
  if (group.enabled && !group.members.length)
    issues.push({ key: 'noMembers', tab: 'members', blocking: false });

  const supported = new Set(supportedModels(group, credentials));
  const firstRow = new Map<string, number>();
  group.models.forEach((model, index) => {
    const row = index + 1;
    const name = model.name.trim();
    if (!name) {
      issues.push({
        key: 'modelNameEmpty',
        tab: 'models',
        blocking: true,
        params: { row },
        modelIndex: index,
        modelField: 'name',
      });
    } else if (name === 'auto') {
      issues.push({
        key: 'modelNameAuto',
        tab: 'models',
        blocking: true,
        params: { row },
        modelIndex: index,
        modelField: 'name',
      });
    } else if (firstRow.has(name)) {
      issues.push({
        key: 'modelNameDuplicate',
        tab: 'models',
        blocking: true,
        params: { row, name, other: (firstRow.get(name) ?? 0) + 1 },
        modelIndex: index,
        modelField: 'name',
      });
    } else {
      firstRow.set(name, index);
    }
    if (!model.target || model.target === 'auto') {
      issues.push({
        key: 'modelTargetEmpty',
        tab: 'models',
        blocking: true,
        params: { row },
        modelIndex: index,
        modelField: 'target',
      });
    } else if (group.members.length && !supported.has(model.target)) {
      issues.push({
        key: 'modelUnsupported',
        tab: 'models',
        blocking: false,
        params: { row, model: model.target },
        modelIndex: index,
        modelField: 'target',
      });
    }
  });
  if (group.enabled && !group.models.length)
    issues.push({ key: 'noModels', tab: 'models', blocking: false });

  if (
    !Number.isInteger(group.maxConcurrent) ||
    group.maxConcurrent < 0 ||
    group.maxConcurrent > 100000
  )
    issues.push({ key: 'invalidLimit', tab: 'policy', blocking: true, field: 'maxConcurrent' });
  return issues;
}

/** Models any account in the pool offers, for choosing targets before members exist. */
export function poolModels(credentials: GroupCredential[]): string[] {
  return [...new Set(credentials.filter((c) => !c.conflict).flatMap((c) => c.models))]
    .filter((id) => id && id !== 'auto')
    .sort();
}
