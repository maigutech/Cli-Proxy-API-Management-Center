import { apiClient } from './client';

export interface GroupMember {
  credentialId: string;
  priority?: number;
  weight?: number;
}
export interface GroupModel {
  name: string;
  target: string;
}
export interface ServiceGroup {
  id: string;
  name: string;
  note: string;
  enabled: boolean;
  archived: boolean;
  members: GroupMember[];
  models: GroupModel[];
  maxConcurrent: number;
  allowAuto: boolean;
  keyId: string;
  keyPrefix: string;
  keyVersion: number;
  keyAvailable: boolean;
}
export interface GroupCredential {
  id: string;
  authId: string;
  name: string;
  provider: string;
  disabled: boolean;
  conflict: boolean;
  models: string[];
  groups: string[];
}
export interface GroupStatus {
  name: string;
  supported: number;
  available: number;
  cooling: number;
  cooldown503: number;
  retryAt?: string;
}
export interface GroupBoard {
  version: number;
  mode: string;
  groups: ServiceGroup[];
  credentials: GroupCredential[];
  statuses: Record<string, GroupStatus[]>;
}
export interface GroupModelCandidates {
  models: string[];
  credentials: GroupCredential[];
  fetchedAt: string;
}
export interface MigrationPreview {
  token: string;
  version: number;
  keyCount: number;
  memberCount: number;
  models: GroupModel[];
}
export interface GroupUsage {
  summary: { requests: number; failed: number; tokens: number; cost: number };
}
const object = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const strings = (v: unknown): string[] =>
  array(v).filter((i): i is string => typeof i === 'string');
export function normalizeGroup(value: unknown): ServiceGroup {
  const v = object(value);
  const policy = object(v.policy);
  return {
    id: str(v.id),
    name: str(v.name),
    note: str(v.note),
    enabled: v.enabled === true,
    archived: v.archived === true,
    keyId: str(v.key_id),
    keyPrefix: str(v.key_prefix),
    keyVersion: num(v.key_version),
    keyAvailable: v.key_available === true,
    maxConcurrent: num(policy.max_concurrent_requests),
    allowAuto: policy.allow_auto === true,
    members: array(v.members).map((m) => {
      const member = object(m);
      return {
        credentialId: str(member.credential_id),
        priority: typeof member.priority === 'number' ? member.priority : undefined,
        weight: typeof member.weight === 'number' ? member.weight : undefined,
      };
    }),
    models: array(v.models).map((m) => {
      const model = object(m);
      return { name: str(model.name), target: str(model.target) };
    }),
  };
}
export function serializeGroup(g: ServiceGroup) {
  return {
    id: g.id,
    name: g.name.trim(),
    note: g.note.trim(),
    enabled: g.enabled,
    archived: g.archived,
    members: g.members.map((m) => ({
      credential_id: m.credentialId,
      priority: m.priority,
      weight: m.weight,
    })),
    models: g.models,
    policy: { max_concurrent_requests: g.maxConcurrent, allow_auto: g.allowAuto },
  };
}
export function normalizeGroupBoard(value: unknown): GroupBoard {
  const v = object(value);
  const statuses: GroupBoard['statuses'] = {};
  for (const [id, raw] of Object.entries(object(v.statuses)))
    statuses[id] = array(raw).map((item) => {
      const s = object(item);
      return {
        name: str(s.name),
        supported: num(s.supported),
        available: num(s.available),
        cooling: num(s.cooling),
        cooldown503: num(s.cooldown_503),
        retryAt: str(s.retry_at) || undefined,
      };
    });
  return {
    version: num(v.version),
    mode: str(v.mode),
    groups: array(v.groups).map(normalizeGroup),
    statuses,
    credentials: array(v.credentials).map((item) => {
      const c = object(item);
      return {
        id: str(c.id),
        authId: str(c.auth_id),
        name: str(c.name),
        provider: str(c.provider),
        disabled: c.disabled === true,
        conflict: c.conflict === true,
        models: strings(c.models),
        groups: strings(c.groups),
      };
    }),
  };
}
export function captureServiceGroupsApi() {
  const revision = apiClient.getConnectionRevision();
  const client = apiClient.captureConnection();
  return {
    revision,
    isCurrent: () => revision === apiClient.getConnectionRevision(),
    setMemberships: async (credentialId: string, groupIds: string[], version: number) => {
      if (revision !== apiClient.getConnectionRevision()) throw new Error('Connection changed');
      return normalizeGroupBoard(
        await client.put(
          `/service-groups/credentials/${encodeURIComponent(credentialId)}/memberships`,
          { version, group_ids: groupIds }
        )
      );
    },
    list: async () => normalizeGroupBoard(await client.get('/service-groups')),
    modelCandidates: async (members: GroupMember[]): Promise<GroupModelCandidates> => {
      const result = object(
        await client.post('/service-groups/model-candidates', {
          members: members.map((m) => ({ credential_id: m.credentialId })),
        })
      );
      return {
        models: [...new Set(strings(result.models))].filter((id) => id && id !== 'auto').sort(),
        credentials: normalizeGroupBoard(result).credentials,
        fetchedAt: str(result.fetched_at),
      };
    },
    key: async (group: ServiceGroup) => {
      const result = object(
        await client.get(
          `/service-groups/${encodeURIComponent(group.id)}/key?key_version=${group.keyVersion}`
        )
      );
      if (!str(result.key) || num(result.key_version) !== group.keyVersion)
        throw new Error('Invalid service group key response');
      return str(result.key);
    },
    restoreKey: (group: ServiceGroup, key: string) =>
      client.put(`/service-groups/${encodeURIComponent(group.id)}/key`, {
        key,
        key_version: group.keyVersion,
      }),
    save: async (group: ServiceGroup, version: number) => {
      const body = { group: serializeGroup(group), version };
      const result = object(
        group.id
          ? await client.put(`/service-groups/${encodeURIComponent(group.id)}`, body)
          : await client.post('/service-groups', body)
      );
      return { key: str(result.key), group: normalizeGroup(result.group) };
    },
    rotate: async (id: string, version: number) =>
      str(
        object(
          await client.post(`/service-groups/${encodeURIComponent(id)}/key/rotate`, { version })
        ).key
      ),
    archive: (id: string, version: number) =>
      client.delete(`/service-groups/${encodeURIComponent(id)}?version=${version}`),
    preview: (group: ServiceGroup) =>
      client.post(
        `/service-groups/${encodeURIComponent(group.id || 'new')}/preview`,
        serializeGroup(group)
      ),
    prepare: async (): Promise<MigrationPreview> => {
      const v = object(await client.post('/service-groups/prepare'));
      return {
        token: str(v.token),
        version: num(v.version),
        keyCount: num(v.key_count),
        memberCount: array(v.members).length,
        models: array(v.models).map((m) => {
          const r = object(m);
          return { name: str(r.name), target: str(r.target) };
        }),
      };
    },
    activate: (preview: MigrationPreview) =>
      client.post('/service-groups/activate', { token: preview.token, version: preview.version }),
    usage: (id: string) =>
      client.get<GroupUsage>(`/service-groups/${encodeURIComponent(id)}/usage`),
  };
}
