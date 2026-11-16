import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast';

// 回归测试：UPDATE 修改申请的审核表单必须以投稿 payload（用户提交的新信息）初始化，
// 而不是线上旧数据 target。修复前表单回填旧信息、diff 恒为空，
// 点「通过并发布」还会把旧数据写回（用户修改被丢弃）。

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: apiMock,
  ApiError: class ApiError extends Error {},
}));

vi.mock('../../lib/meta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/meta')>();
  return { ...actual, loadMeta: vi.fn(async () => actual.EMPTY_META) };
});

import AdminReviewPage from './AdminReviewPage';

const NEW_NAME = '修改后的群名';
const OLD_NAME = '旧群名';

const updatePayload = {
  name: NEW_NAME,
  platform: 'QQ',
  groupNumber: '987654',
  type: 'GENERAL',
  description: '修改后的简介',
  tags: ['tag-1'],
};

const oldTarget = {
  id: 'group-1',
  name: OLD_NAME,
  platform: 'QQ',
  groupNumber: '123456',
  type: 'GENERAL',
  description: '旧的简介',
  province: null,
  city: null,
  school: null,
  regionCode: null,
  regionName: null,
  purpose: null,
  joinUrl: null,
  qrcodeUrl: null,
  avatarUrl: null,
  tags: [
    { id: 'tag-old', name: '旧标签', slug: 'tag-old', scope: 'GROUP', color: '#FFB454', kind: null, sortOrder: 0 },
  ],
  published: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const submission = {
  id: 'sub-1',
  entityType: 'GROUP',
  mode: 'UPDATE',
  targetId: 'group-1',
  payload: updatePayload,
  status: 'PENDING',
  reviewNote: null,
  submitterId: 'user-1',
  submitter: { id: 'user-1', nickname: '投稿人', email: 'user@test.dev' },
  reviewerId: null,
  createdAt: '2026-11-16T00:00:00.000Z',
  reviewedAt: null,
};

function setupApiMocks() {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/api/admin/submissions') {
      return Promise.resolve({ items: [submission], total: 1, page: 1, pageSize: 10 });
    }
    if (url.startsWith('/api/admin/submissions/')) {
      return Promise.resolve({ item: submission, target: oldTarget });
    }
    return Promise.reject(new Error(`unexpected url: ${url}`));
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AdminReviewPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeAll(() => {
  setupApiMocks();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setupApiMocks();
});

/** 在审核表单里定位「群名」输入框（Field 的 label 是 label 元素，同层 div 内包含 input） */
function findNameInput(): HTMLInputElement {
  const label = screen.getAllByText('群名').find((el) => el.tagName === 'LABEL');
  expect(label, '审核表单中应渲染「群名」字段').toBeDefined();
  const input = label!.closest('div')?.querySelector('input');
  expect(input).toBeDefined();
  return input as HTMLInputElement;
}

describe('审核台 · 修改申请表单初始化', () => {
  it('UPDATE 修改申请的审核表单显示投稿新信息，而不是线上旧信息', async () => {
    const user = userEvent.setup();
    renderPage();

    // 列表出现后点击条目打开审核抽屉
    const rowButton = await screen.findByRole('button', { name: new RegExp(NEW_NAME) });
    await user.click(rowButton);

    // 审核表单以投稿 payload 初始化：群名是新信息（修复前这里会显示「旧群名」）
    await waitFor(() => {
      expect(findNameInput().value).toBe(NEW_NAME);
    });
    expect(findNameInput().value).not.toBe(OLD_NAME);
  });

  it('修改申请展示与线上内容的字段差异（旧 → 新）', async () => {
    const user = userEvent.setup();
    renderPage();

    const rowButton = await screen.findByRole('button', { name: new RegExp(NEW_NAME) });
    await user.click(rowButton);

    // diff 以线上旧数据为基准、表单（新信息）为对比对象，应显示群名与简介的改动
    await waitFor(() => {
      expect(screen.getByText('与线上内容的字段差异')).toBeInTheDocument();
    });
    expect(screen.getAllByText(OLD_NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText(NEW_NAME).length).toBeGreaterThan(0);
  });
});
