import { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './lib/auth';
import HomePage from './pages/HomePage';
import GroupsPage from './pages/GroupsPage';
import GroupDetailPage from './pages/GroupDetailPage';
import SitesPage from './pages/SitesPage';
import ActivitiesPage from './pages/ActivitiesPage';
import ActivityDetailPage from './pages/ActivityDetailPage';
import GalleryPage from './pages/GalleryPage';
import SpacePage from './pages/SpacePage';
import LoginPage from './pages/LoginPage';
import ExternalRedirectPage from './pages/ExternalRedirectPage';
import SubmitPage from './pages/SubmitPage';
import MePage from './pages/MePage';
import AboutPage from './pages/AboutPage';
import PrivacyPage from './pages/PrivacyPage';
import NotFoundPage from './pages/NotFoundPage';

// 控制舱整组按需加载：普通访客无需下载后台代码
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminReviewPage = lazy(() => import('./pages/admin/AdminReviewPage'));
const AdminContentPage = lazy(() => import('./pages/admin/AdminContentPage'));
const AdminActivitiesPage = lazy(() => import('./pages/admin/AdminActivitiesPage'));
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const AdminTagsPage = lazy(() => import('./pages/admin/AdminTagsPage'));
const AdminRulesPage = lazy(() => import('./pages/admin/AdminRulesPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));

// ===== 首屏 boot 层控制 =====
// 计时起点为 JS 模块初始化（HTML 静态层在此之前已由纯 CSS 播放）
const BOOT_START = Date.now();
const MIN_BOOT_MS = 1500; // 最短展示时长，保证入场动画完整、退场不闪烁
const BOOT_TIMEOUT_MS = 4000; // 超时兜底：资源迟迟未就绪也强制结束

// index.html 的静态 boot 层一直播到 React 宣告"就绪"：
// 结束条件 = 认证初始化完成（首个全局请求返回）且已满足最短展示时长；
// 超时兜底 = auth 卡死 4s 后强制结束（另有 CSS 9s 纯动画兜底覆盖 JS 失效场景）
function BootController() {
  const { loading } = useAuth();
  const finishedRef = useRef(false);

  useEffect(() => {
    const el = document.getElementById('boot-screen');
    if (!el || finishedRef.current) return;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      el.classList.add('is-done');
      const remove = () => el.remove();
      el.addEventListener('transitionend', remove, { once: true });
      // transitionend 可能因标签页后台等场景不触发，补一个移除兜底
      window.setTimeout(remove, 900);
    };

    if (loading) {
      const timer = window.setTimeout(finish, BOOT_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    }
    const wait = Math.max(0, MIN_BOOT_MS - (Date.now() - BOOT_START));
    const timer = window.setTimeout(finish, wait);
    return () => window.clearTimeout(timer);
  }, [loading]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BootController />
      <BrowserRouter>
        <ToastProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="groups/:id" element={<GroupDetailPage />} />
              <Route path="sites" element={<SitesPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="activities/:id" element={<ActivityDetailPage />} />
              <Route path="gallery" element={<GalleryPage />} />
              <Route path="gallery/submit" element={<Navigate to="/submit?tab=gallery" replace />} />
              <Route path="submit" element={<SubmitPage />} />
              <Route path="me" element={<MePage />} />
              <Route path="space/:uid" element={<SpacePage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="redirect" element={<ExternalRedirectPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="privacy" element={<PrivacyPage />} />

              <Route path="admin" element={<ProtectedAdminRoute />}>
                <Route element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="review" element={<AdminReviewPage />} />
                  <Route path="content" element={<AdminContentPage />} />
                  <Route path="activities" element={<AdminActivitiesPage />} />
                  <Route path="reports" element={<AdminReportsPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                  <Route path="tags" element={<AdminTagsPage />} />
                  <Route path="rules" element={<AdminRulesPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
