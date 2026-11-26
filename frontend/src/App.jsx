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
import ClosedSalesPage from './pages/sales-agent/ClosedSalesPage.jsx';
import LeadCreatePage from './pages/sales-agent/LeadCreatePage.jsx';
import LeadEditPage from './pages/sales-agent/LeadEditPage.jsx';
import AssignedLeadsPage from './pages/closer/AssignedLeadsPage.jsx';
import CloserMyCallbacksPage from './pages/closer/CloserMyCallbacksPage.jsx';
import CloserMockupPage from './pages/closer/CloserMockupPage.jsx';
import CloserDashboardPage from './pages/CloserDashboard.page.jsx';
import CstManagerDashboardPage from './pages/CstManagerDashboard.page.jsx';
import HandoverQueuePage from './pages/cst-manager/HandoverQueuePage.jsx';
import ClientDetailPage from './pages/cst-manager/ClientDetailPage.jsx';
import CstClientsPage from './pages/cst-manager/CstClientsPage.jsx';
import CstMockupPage from './pages/cst-manager/CstMockupPage.jsx';
import TechTeamDashboardPage from './pages/TechTeamDashboard.page.jsx';
import MyProjectsPage from './pages/tech-team/MyProjectsPage.jsx';
import PriorityTasksPage from './pages/tech-team/PriorityTasksPage.jsx';
import TechClientPortfolioPage from './pages/tech-team/TechClientPortfolioPage.jsx';
import TechTeamMockupPage from './pages/tech-team/TechTeamMockupPage.jsx';
import TechHeadDashboardPage from './pages/TechHeadDashboard.page.jsx';
import TechHeadQueuePage from './pages/tech-head/TechHeadQueuePage.jsx';
import TechHeadAssignedPage from './pages/tech-head/TechHeadAssignedPage.jsx';
import TechHeadCompletedPage from './pages/tech-head/TechHeadCompletedPage.jsx';
import TechHeadPriorityPage from './pages/tech-head/TechHeadPriorityPage.jsx';
import TechHeadTeamPage from './pages/tech-head/TechHeadTeamPage.jsx';
import TechHeadEscalationsPage from './pages/tech-head/TechHeadEscalationsPage.jsx';
import TechHeadTeamCommentsPage from './pages/tech-head/TechHeadTeamCommentsPage.jsx';
import TechHeadInternActivityPage from './pages/tech-head/TechHeadInternActivityPage.jsx';
import TechHeadClientPage from './pages/tech-head/TechHeadClientPage.jsx';
import TechHeadMockupPage from './pages/tech-head/TechHeadMockupPage.jsx';

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
        path="/dashboard/sales-agent/closed-sales"
        element={
          <RoleRoute allowedRoles={['sales_agent']}>
            <ClosedSalesPage />
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
        path="/dashboard/closer/mockup"
        element={
          <RoleRoute allowedRoles={['closer']}>
            <CloserMockupPage />
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
        path="/dashboard/cst-manager/client/:id"
        element={
          <RoleRoute allowedRoles={['cst_manager']}>
            <ClientDetailPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/cst-manager/clients"
        element={
          <RoleRoute allowedRoles={['cst_manager']}>
            <CstClientsPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/cst-manager/mockup"
        element={
          <RoleRoute allowedRoles={['cst_manager']}>
            <CstMockupPage />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/client/:id"
        element={
          <RoleRoute allowedRoles={['super_admin', 'admin']}>
            <ClientDetailPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadDashboardPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/queue"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadQueuePage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/assigned"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadAssignedPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/completed"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadCompletedPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/priority"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadPriorityPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/team"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadTeamPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/escalations"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadEscalationsPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/team-comments"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadTeamCommentsPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/intern-activity"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadInternActivityPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/client/:id"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadClientPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-head/mockup"
        element={
          <RoleRoute allowedRoles={['tech_head']}>
            <TechHeadMockupPage />
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
      <Route
        path="/dashboard/tech-team/priority"
        element={
          <RoleRoute allowedRoles={['tech_team']}>
            <PriorityTasksPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-team/client/:id"
        element={
          <RoleRoute allowedRoles={['tech_team']}>
            <TechClientPortfolioPage />
          </RoleRoute>
        }
      />
      <Route
        path="/dashboard/tech-team/mockup"
        element={
          <RoleRoute allowedRoles={['tech_team']}>
            <TechTeamMockupPage />
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
