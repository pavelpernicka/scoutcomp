import React from "react";
import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminApprovals from "./pages/AdminApprovals";
import AdminAnnouncements from "./pages/AdminAnnouncements";
import AdminAttendance from "./pages/AdminAttendance";
import AdminConfig from "./pages/AdminConfig";
import AdminTasks from "./pages/AdminTasks";
import AdminTeams from "./pages/AdminTeams";
import AdminStats from "./pages/AdminStats";
import HomeDashboard from "./pages/HomeDashboard";
import InventoryPage from "./pages/Inventory";
import LeaderboardPage from "./pages/Leaderboard";
import LoginPage from "./pages/Login";
import TasksPage from "./pages/Tasks";
import RulesPage from "./pages/Rules";
import UserSettingsPage from "./pages/UserSettings";
import ActivityPage from "./pages/Activity";
import MessagesPage from "./pages/Messages";
import { PostsPage as MemberPostsPage, PostDetailPage } from "./pages/Posts";
import AdminModules from "./pages/AdminModules";
import AdminAccess from "./pages/AdminAccess";
import AdminCompetitionAudit from "./pages/AdminCompetitionAudit";
import ModuleSettings from "./pages/ModuleSettings";
import AdminWidgets from "./pages/AdminWidgets";
import MembersDirectory from "./modules/members/MembersDirectory";
import MemberDetail from "./modules/members/MemberDetail";
import { useConfig } from "./providers/ConfigProvider";

const WebAdminRoute = React.lazy(() => import("./modules/web/WebAdminRoute"));
const PagesPage = React.lazy(() => import("./modules/web/pages/PagesPage"));
const PostsPage = React.lazy(() => import("./modules/web/admin/PostsPage"));
const MenusPage = React.lazy(() => import("./modules/web/admin/MenusPage"));
const SettingsPage = React.lazy(() => import("./modules/web/admin/SettingsPage"));
const MediaPage = React.lazy(() => import("./modules/web/media/MediaPage"));
const DesignResourcesPage = React.lazy(() => import("./modules/web/design/DesignResourcesPage"));
const TemplateSettingsPage = React.lazy(() => import("./modules/web/design/GlobalStylesPage"));
const DesignResourceEditorPage = React.lazy(() => import("./modules/web/design/DesignResourceEditorPage"));
const ThemesPage = React.lazy(() => import("./modules/web/themes/ThemesPage"));
const WebEditorPage = React.lazy(() => import("./modules/web/editor/WebEditorPage"));

export default function App() {
  const { config } = useConfig();
  const location = useLocation();
  const isWebEditor = /^\/admin\/web\/(?:pages\/\d+|design\/(?:templates|components|sections)\/\d+)\/editor\/?$/.test(location.pathname);

  // Update document title when config changes
  useEffect(() => {
    if (config?.app_name) {
      document.title = config.app_name;
    }
  }, [config?.app_name]);

  const routes = (
    <Suspense fallback={<div className="loader">Loading…</div>}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomeDashboard />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/settings" element={<UserSettingsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/posts" element={<MemberPostsPage />} />
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["core.access.manage"]} />}>
            <Route path="/admin/core/access" element={<AdminAccess />} />
            <Route path="/admin/access" element={<AdminAccess />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["core.modules.manage"]} />}>
            <Route path="/admin/core/modules" element={<AdminModules />} />
            <Route path="/admin/core/modules/:code" element={<ModuleSettings />} />
            <Route path="/admin/core/widgets" element={<AdminWidgets />} />
            <Route path="/admin/core/config" element={<AdminConfig />} />
            <Route path="/admin/modules" element={<AdminModules />} />
            <Route path="/admin/modules/:code" element={<ModuleSettings />} />
            <Route path="/admin/widgets" element={<AdminWidgets />} />
            <Route path="/admin/config" element={<AdminConfig />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["core.teams.manage"]} />}>
            <Route path="/admin/core/teams" element={<AdminTeams />} />
            <Route path="/admin/teams" element={<AdminTeams />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["core.attendance.manage"]} />}>
            <Route path="/admin/core/attendance" element={<AdminAttendance />} />
            <Route path="/admin/attendance" element={<AdminAttendance />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["core.posts.manage", "web.posts.manage", "web.manage"]} />}>
            <Route path="/admin/core/posts" element={<PostsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["core.media.manage", "web.media.manage", "web.manage"]} />}>
            <Route path="/admin/core/media" element={<MediaPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["competitions.approvals.audit"]} />}>
            <Route path="/admin/competition/approvals" element={<AdminApprovals />} />
            <Route path="/admin/competition/audit" element={<AdminCompetitionAudit />} />
            <Route path="/admin/approvals" element={<AdminApprovals />} />
            <Route path="/admin/competition-audit" element={<AdminCompetitionAudit />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["competitions.tasks.manage"]} />}>
            <Route path="/admin/competition/tasks" element={<AdminTasks />} />
            <Route path="/admin/tasks" element={<AdminTasks />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["competitions.announcements.manage"]} />}>
            <Route path="/admin/competition/announcements" element={<AdminAnnouncements />} />
            <Route path="/admin/announcements" element={<AdminAnnouncements />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["competitions.statistics.read"]} />}>
            <Route path="/admin/competition/stats" element={<AdminStats />} />
            <Route path="/admin/stats" element={<AdminStats />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["admin", "group_admin"]} />}>
            <Route path="/inventory" element={<Navigate to="/inventory/items" replace />} />
            <Route path="/inventory/:screen" element={<InventoryPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["web.pages.manage", "web.manage"]} />}>
            <Route path="/admin/web" element={<Navigate to="/admin/web/pages" replace />} />
            <Route path="/admin/web/pages" element={<WebAdminRoute><PagesPage /></WebAdminRoute>} />
            <Route path="/admin/web/pages/:id/editor" element={<WebEditorPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["web.menus.manage", "web.manage"]} />}>
            <Route path="/admin/web/menus" element={<WebAdminRoute><MenusPage /></WebAdminRoute>} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["web.media.manage", "web.manage"]} />}>
            <Route path="/admin/web/media" element={<WebAdminRoute><MediaPage /></WebAdminRoute>} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["web.templates.manage", "web.manage"]} />}>
            <Route path="/admin/web/design/templates" element={<WebAdminRoute><DesignResourcesPage kind="templates" /></WebAdminRoute>} />
            <Route path="/admin/web/design/templates/:id/editor" element={<DesignResourceEditorPage kind="templates" />} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["web.design.manage", "web.manage"]} />}>
            <Route path="/admin/web/design/components" element={<WebAdminRoute><DesignResourcesPage kind="components" /></WebAdminRoute>} />
            <Route path="/admin/web/design/components/:id/editor" element={<DesignResourceEditorPage kind="components" />} />
            <Route path="/admin/web/design/sections" element={<WebAdminRoute><DesignResourcesPage kind="sections" /></WebAdminRoute>} />
            <Route path="/admin/web/design/sections/:id/editor" element={<DesignResourceEditorPage kind="sections" />} />
            <Route path="/admin/web/design/styles" element={<WebAdminRoute><TemplateSettingsPage /></WebAdminRoute>} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["web.themes.manage", "web.manage"]} />}>
            <Route path="/admin/web/themes" element={<WebAdminRoute><ThemesPage /></WebAdminRoute>} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["web.settings.manage", "web.manage"]} />}>
            <Route path="/admin/web/settings" element={<WebAdminRoute><SettingsPage /></WebAdminRoute>} />
          </Route>
          <Route element={<ProtectedRoute allowedPermissions={["core.members.read"]} />}>
            <Route path="/admin/core/users" element={<MembersDirectory />} />
            <Route path="/admin/users" element={<MembersDirectory />} />
            <Route path="/admin/core/users/:id" element={<MemberDetail />} />
            <Route path="/admin/users/:id" element={<MemberDetail />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
  );

  return isWebEditor ? routes : <Layout>{routes}</Layout>;
}
