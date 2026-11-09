import type { AuthFileItem } from '@/types';
import type { GroupBoard } from '@/services/api/serviceGroups';

export const UNASSIGNED_GROUP = '__unassigned__';
export type GroupLabel = { id: string; name: string };

export function groupMembership(board: GroupBoard | null) {
  const byCredential = new Map<string, GroupLabel[]>();
  for (const group of board?.groups ?? []) {
    if (group.archived) continue;
    for (const member of group.members) {
      const labels = byCredential.get(member.credentialId) ?? [];
      labels.push({ id: group.id, name: group.name });
      byCredential.set(member.credentialId, labels);
    }
  }
  const byAuth = new Map((board?.credentials ?? []).map((c) => [c.authId, c]));
  return (file: AuthFileItem): GroupLabel[] => {
    const credential = file.authId ? byAuth.get(file.authId) : undefined;
    return credential?.id && !credential.conflict ? (byCredential.get(credential.id) ?? []) : [];
  };
}

export function matchesGroup(labels: GroupLabel[], selected: string): boolean {
  return (
    !selected ||
    (selected === UNASSIGNED_GROUP ? labels.length === 0 : labels.some((g) => g.id === selected))
  );
}

export function groupCounts(
  files: AuthFileItem[],
  membership: (file: AuthFileItem) => GroupLabel[]
) {
  const counts: Record<string, number> = { '': files.length, [UNASSIGNED_GROUP]: 0 };
  for (const file of files) {
    const labels = membership(file);
    if (!labels.length) counts[UNASSIGNED_GROUP]++;
    for (const group of labels) counts[group.id] = (counts[group.id] ?? 0) + 1;
  }
  return counts;
}
