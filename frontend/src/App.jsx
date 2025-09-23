import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminApprovals from "./pages/AdminApprovals";
import AdminAnnouncements from "./pages/AdminAnnouncements";
import AdminConfig from "./pages/AdminConfig";
import AdminTasks from "./pages/AdminTasks";
import AdminTeams from "./pages/AdminTeams";
import AdminUsers from "./pages/AdminUsers";
import AdminStats from "./pages/AdminStats";
import Dashboard from "./pages/Dashboard";
import LeaderboardPage from "./pages/Leaderboard";
import LoginPage from "./pages/Login";
import TasksPage from "./pages/Tasks";
import RulesPage from "./pages/Rules";
import UserSettingsPage from "./pages/UserSettings";
import { useConfig } from "./providers/ConfigProvider";

export default function App() {
  const { config } = useConfig();

  // Update document title when config changes
  useEffect(() => {
    if (config?.app_name) {
      document.title = config.app_name;
    }
  }, [config?.app_name]);

  return (
    <Layout>
      <Suspense fallback={<div className="loader">Loading…</div>}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/settings" element={<UserSettingsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["admin", "group_admin"]} />}>
            <Route path="/admin/approvals" element={<AdminApprovals />} />
            <Route path="/admin/teams" element={<AdminTeams />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/stats" element={<AdminStats />} />
            <Route path="/admin/announcements" element={<AdminAnnouncements />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path="/admin/tasks" element={<AdminTasks />} />
            <Route path="/admin/config" element={<AdminConfig />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
