import { Routes, Route, Navigate } from 'react-router-dom';
import RoleRoute from './components/RoleRoute.component.jsx';
import LoginPage from './pages/Login.page.jsx';
import RegisterPage from './pages/Register.page.jsx';
import AdminDashboardPage from './pages/AdminDashboard.page.jsx';
import AdminMonitorPage from './pages/AdminMonitor.page.jsx';
import SalesAgentDashboardPage from './pages/SalesAgentDashboard.page.jsx';
import CloserDashboardPage from './pages/CloserDashboard.page.jsx';
import CstManagerDashboardPage from './pages/CstManagerDashboard.page.jsx';
import TechTeamDashboardPage from './pages/TechTeamDashboard.page.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route
        path="/admin"
        element={
          <RoleRoute allowedRoles={[]}>
            <AdminDashboardPage />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/monitor"
        element={
          <RoleRoute allowedRoles={['admin']}>
            <AdminMonitorPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/sales-agent"
        element={
          <RoleRoute allowedRoles={['sales_agent']}>
            <SalesAgentDashboardPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/closer"
        element={
          <RoleRoute allowedRoles={['closer']}>
            <CloserDashboardPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/cst-manager"
        element={
          <RoleRoute allowedRoles={['cst_manager']}>
            <CstManagerDashboardPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-team"
        element={
          <RoleRoute allowedRoles={['tech_team']}>
            <TechTeamDashboardPage />
          </RoleRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function Unauthorized() {
  return <div>Unauthorized</div>;
}

export default App;
