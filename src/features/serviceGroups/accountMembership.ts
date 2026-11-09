import type { AuthFileItem } from '@/types';
import type { GroupBoard } from '@/services/api/serviceGroups';

export function membershipCredential(board: GroupBoard | null, file: AuthFileItem) {
  if (!file.authId || board?.mode !== 'grouped') return null;
  const matches = board.credentials.filter((credential) => credential.authId === file.authId);
  const credential = matches[0];
  return matches.length === 1 && credential?.id && !credential.conflict ? credential : null;
}

export function credentialGroupIds(board: GroupBoard, credentialId: string): string[] {
  return board.groups
    .filter(
      (group) => !group.archived && group.members.some((m) => m.credentialId === credentialId)
    )
    .map((group) => group.id);
}

export function membershipRemovalIssue(
  board: GroupBoard,
  credentialId: string,
  selected: string[]
): {
  key: 'membershipLastMember' | 'membershipModelRequired';
  group: string;
  model?: string;
} | null {
  const credentials = new Map(
    board.credentials.filter((c) => c.id && !c.conflict).map((c) => [c.id, c])
  );
  for (const group of board.groups) {
    if (group.archived || !group.enabled || selected.includes(group.id)) continue;
    if (!group.members.some((m) => m.credentialId === credentialId)) continue;
    const remaining = group.members.filter((m) => m.credentialId !== credentialId);
    if (!remaining.length) return { key: 'membershipLastMember', group: group.name };
    const models = new Set(remaining.flatMap((m) => credentials.get(m.credentialId)?.models ?? []));
    const unsupported = group.models.find((model) => !models.has(model.target));
    if (unsupported)
      return { key: 'membershipModelRequired', group: group.name, model: unsupported.name };
  }
  return null;
}
