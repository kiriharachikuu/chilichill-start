import {
  GROUP_PLATFORM_LABELS,
  GROUP_TYPE_LABELS,
  formatLocation,
  type Group,
  type GroupPlatform,
  type GroupType,
  type Tag,
} from '@spaceport/shared';

export interface DiffRow {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    return value.length ? value.join('、') : '—';
  }
  return String(value);
}

function tagLabel(ids: unknown, pool: Tag[]): string {
  const map = new Map(pool.map((tag) => [tag.id, tag.name]));
  if (!Array.isArray(ids)) return '—';
  const names = ids
    .filter((item): item is string => typeof item === 'string')
    .map((id) => map.get(id) ?? `#${id}`);
  return names.length ? names.join('、') : '—';
}

function typeLabel(value: unknown): string {
  if (typeof value === 'string' && value in GROUP_TYPE_LABELS) {
    return GROUP_TYPE_LABELS[value as GroupType];
  }
  return display(value);
}

function platformLabel(value: unknown): string {
  if (typeof value === 'string' && value in GROUP_PLATFORM_LABELS) {
    return GROUP_PLATFORM_LABELS[value as GroupPlatform];
  }
  return display(value);
}

export function groupDiff(target: Group, payload: Record<string, unknown>, pool: Tag[]): DiffRow[] {
  const rows: DiffRow[] = [];
  const push = (key: string, label: string, before: unknown, after: unknown) => {
    const beforeText = display(before);
    const afterText = display(after);
    rows.push({ key, label, before: beforeText, after: afterText, changed: beforeText !== afterText });
  };

  push('name', '群名', target.name, payload.name);
  rows.push({
    key: 'platform',
    label: '群平台',
    before: GROUP_PLATFORM_LABELS[target.platform],
    after: platformLabel(payload.platform),
    changed: GROUP_PLATFORM_LABELS[target.platform] !== platformLabel(payload.platform),
  });
  push('groupNumber', '群号', target.groupNumber, payload.groupNumber);
  rows.push({
    key: 'type',
    label: '群类型',
    before: GROUP_TYPE_LABELS[target.type],
    after: typeLabel(payload.type),
    changed: GROUP_TYPE_LABELS[target.type] !== typeLabel(payload.type),
  });
  push(
    'city',
    '城市',
    formatLocation(target.province, target.city),
    formatLocation(payload.province as string | null, payload.city as string | null),
  );
  push('school', '学校', target.school, payload.school);
  push('regionCode', '大区归属', target.regionName, payload.province || payload.city ? '按省份映射' : '—');
  push('description', '群简介', target.description, payload.description);
  push('purpose', '用途说明', target.purpose, payload.purpose);
  push('joinUrl', '加入链接', target.joinUrl, payload.joinUrl);
  push('avatarUrl', '群头像', target.avatarUrl, payload.avatarUrl);
  push('qrcodeUrl', '二维码', target.qrcodeUrl, payload.qrcodeUrl);
  rows.push({
    key: 'tags',
    label: '标签',
    before: target.tags.map((tag) => tag.name).join('、') || '—',
    after: tagLabel(payload.tags, pool),
    changed:
      target.tags.map((tag) => tag.name).join('、') !== tagLabel(payload.tags, pool),
  });
  return rows;
}

export function siteDiff(
  target: { title: string; url: string; description: string; coverUrl: string | null; tags: Tag[] },
  payload: Record<string, unknown>,
  pool: Tag[],
): DiffRow[] {
  const rows: DiffRow[] = [];
  const push = (key: string, label: string, before: unknown, after: unknown) => {
    const beforeText = display(before);
    const afterText = display(after);
    rows.push({ key, label, before: beforeText, after: afterText, changed: beforeText !== afterText });
  };

  push('title', '标题', target.title, payload.title);
  push('url', '链接', target.url, payload.url);
  push('description', '简介', target.description, payload.description);
  push('coverUrl', '封面', target.coverUrl, payload.coverUrl);
  rows.push({
    key: 'tags',
    label: '标签',
    before: target.tags.map((tag) => tag.name).join('、') || '—',
    after: tagLabel(payload.tags, pool),
    changed:
      target.tags.map((tag) => tag.name).join('、') !== tagLabel(payload.tags, pool),
  });
  return rows;
}

export function changedDiffRows(rows: DiffRow[]): DiffRow[] {
  return rows.filter((row) => row.changed);
}
