// 站点更新日志数据源：GitHub 提交历史（main 分支）
// 未认证的 GitHub API 配额为 60 次/小时/IP，第一页结果做 localStorage 缓存（1 小时）以节省配额

const REPO_OWNER = 'kiriharachikuu';
const REPO_NAME = 'chilichill-start';
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits`;
export const COMMITS_PAGE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/commits/main/`;

const PER_PAGE = 30;
const CACHE_KEY = 'chilichill:changelog:v1';
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface ChangelogEntry {
  sha: string;
  htmlUrl: string;
  /** 提交标题（首行，未去掉类型前缀） */
  title: string;
  /** 正文（首行之后的非空行） */
  body: string[];
  /** ISO 时间 */
  date: string;
}

export interface ChangelogPage {
  entries: ChangelogEntry[];
  page: number;
  /** 返回条数达到 per_page 时视为可能还有下一页 */
  hasMore: boolean;
}

export type CommitTone = 'neutral' | 'amber' | 'coral' | 'aurora' | 'mint' | 'violet';

export interface CommitTypeInfo {
  /** 徽标文案，如「新功能」「问题修复」 */
  label: string;
  tone: CommitTone;
  /** 去掉类型前缀后的标题 */
  title: string;
}

const COMMIT_TYPES: Record<string, { label: string; tone: CommitTone }> = {
  feat: { label: '新功能', tone: 'amber' },
  fix: { label: '问题修复', tone: 'mint' },
  perf: { label: '性能优化', tone: 'coral' },
  refactor: { label: '重构', tone: 'aurora' },
  docs: { label: '文档', tone: 'violet' },
  style: { label: '界面样式', tone: 'violet' },
  test: { label: '测试', tone: 'neutral' },
  chore: { label: '日常维护', tone: 'neutral' },
  build: { label: '构建部署', tone: 'neutral' },
  ci: { label: '构建部署', tone: 'neutral' },
};

/** 识别约定式提交前缀（feat:/fix(scope): 等），返回徽标信息与去掉前缀后的标题 */
export function parseCommitType(messageTitle: string): CommitTypeInfo {
  const mergeMatch = /^merge\s/i.exec(messageTitle);
  if (mergeMatch) {
    return { label: '合并提交', tone: 'neutral', title: messageTitle };
  }
  const match = /^(\w+)(?:\([^)]*\))?!?:\s*/.exec(messageTitle);
  const key = match?.[1]?.toLowerCase();
  const known = key ? COMMIT_TYPES[key] : undefined;
  if (known) {
    return { ...known, title: messageTitle.slice(match![0].length) };
  }
  return { label: '更新', tone: 'neutral', title: messageTitle };
}

interface RawCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string } | null;
  };
}

function toEntry(item: RawCommit): ChangelogEntry {
  const lines = item.commit.message.split('\n');
  const body = lines.slice(1).map((line) => line.trimEnd());
  // 去掉正文首尾空行
  while (body.length > 0 && !body[0].trim()) body.shift();
  while (body.length > 0 && !body[body.length - 1].trim()) body.pop();
  return {
    sha: item.sha,
    htmlUrl: item.html_url,
    title: (lines[0] ?? '').trim(),
    body,
    date: item.commit.author?.date ?? '',
  };
}

interface CacheShape {
  fetchedAt: number;
  entries: ChangelogEntry[];
}

let memoryCache: CacheShape | null = null;

/** 读取 1 小时内的首页缓存（内存 → localStorage），过期或不完整返回 null */
export function readCachedChangelog(): ChangelogEntry[] | null {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.entries;
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (
      typeof parsed.fetchedAt !== 'number' ||
      !Array.isArray(parsed.entries) ||
      Date.now() - parsed.fetchedAt > CACHE_TTL_MS
    ) {
      return null;
    }
    memoryCache = parsed;
    return parsed.entries;
  } catch {
    return null;
  }
}

function writeCache(entries: ChangelogEntry[]): void {
  memoryCache = { fetchedAt: Date.now(), entries };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache));
  } catch {
    // 隐私模式等场景下 localStorage 不可用，忽略即可
  }
}

/** 拉取指定页的提交记录（每页 30 条，最新在前） */
export async function fetchChangelogPage(page: number): Promise<ChangelogPage> {
  const response = await fetch(`${API_URL}?page=${page}&per_page=${PER_PAGE}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}`);
  }
  const items = (await response.json()) as RawCommit[];
  if (!Array.isArray(items)) {
    throw new Error('GitHub API 响应格式异常');
  }
  const entries = items.map(toEntry);
  if (page === 1) {
    writeCache(entries);
  }
  return { entries, page, hasMore: items.length >= PER_PAGE };
}
