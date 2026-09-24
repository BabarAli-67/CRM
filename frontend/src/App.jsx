import { Routes, Route, Navigate } from 'react-router-dom';
import RoleRoute from './components/RoleRoute.component.jsx';
import LoginPage from './pages/Login.page.jsx';
import RegisterPage from './pages/Register.page.jsx';
import AdminDashboardPage from './pages/AdminDashboard.page.jsx';
import AdminMonitorPage from './pages/AdminMonitor.page.jsx';
import AllCallbacksPage from './pages/admin/AllCallbacksPage.jsx';
import PipelineOverviewPage from './pages/admin/PipelineOverviewPage.jsx';
import MonthlyReportPage from './pages/admin/MonthlyReportPage.jsx';
import SalesAgentDashboardPage from './pages/SalesAgentDashboard.page.jsx';
import MyCallbacksPage from './pages/sales-agent/MyCallbacksPage.jsx';
import MyLeadsPage from './pages/sales-agent/MyLeadsPage.jsx';
import LeadCreatePage from './pages/sales-agent/LeadCreatePage.jsx';
import LeadEditPage from './pages/sales-agent/LeadEditPage.jsx';
import ClosedSalesPage from './pages/sales-agent/ClosedSalesPage.jsx';
import AssignedLeadsPage from './pages/closer/AssignedLeadsPage.jsx';
import CloserMyCallbacksPage from './pages/closer/CloserMyCallbacksPage.jsx';
import CloserDashboardPage from './pages/CloserDashboard.page.jsx';
import CstManagerDashboardPage from './pages/CstManagerDashboard.page.jsx';
import HandoverQueuePage from './pages/cst-manager/HandoverQueuePage.jsx';
import TechTeamDashboardPage from './pages/TechTeamDashboard.page.jsx';
import MyProjectsPage from './pages/tech-team/MyProjectsPage.jsx';

import ReminderDevHarnessPage from './pages/ReminderDevHarness.page.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/dev/reminders" element={<ReminderDevHarnessPage />} />
      <Route
        path="/admin"
        element={
          <RoleRoute allowedRoles={['super_admin']}>
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
        path="/admin/callbacks"
        element={
          <RoleRoute allowedRoles={['super_admin', 'admin']}>
            <AllCallbacksPage />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/pipeline"
        element={
          <RoleRoute allowedRoles={['super_admin', 'admin']}>
            <PipelineOverviewPage />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/reports/monthly"
        element={
          <RoleRoute allowedRoles={['super_admin', 'admin']}>
            <MonthlyReportPage />
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
        path="/dashboard/sales-agent/callbacks"
        element={
          <RoleRoute allowedRoles={['sales_agent']}>
            <MyCallbacksPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/sales-agent/leads"
        element={
          <RoleRoute allowedRoles={['sales_agent']}>
            <MyLeadsPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/sales-agent/leads/new"
        element={
          <RoleRoute allowedRoles={['sales_agent']}>
            <LeadCreatePage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/sales-agent/leads/:id/edit"
        element={
          <RoleRoute allowedRoles={['sales_agent']}>
            <LeadEditPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/sales-agent/closed-sales"
        element={
          <RoleRoute allowedRoles={['sales_agent']}>
            <ClosedSalesPage />
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
        path="/dashboard/closer/leads"
        element={
          <RoleRoute allowedRoles={['closer']}>
            <AssignedLeadsPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/closer/callbacks"
        element={
          <RoleRoute allowedRoles={['closer']}>
            <CloserMyCallbacksPage />
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
        path="/dashboard/cst-manager/handover"
        element={
          <RoleRoute allowedRoles={['cst_manager']}>
            <HandoverQueuePage />
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
      <Route
        path="/dashboard/tech-team/projects"
        element={
          <RoleRoute allowedRoles={['tech_team']}>
            <MyProjectsPage />
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
