import { useNavigate } from 'react-router-dom';
import AttendanceBanner from '../components/AttendanceBanner.component.jsx';
import AttendanceHistory from '../components/AttendanceHistory.component.jsx';
import GracefulExitModal from '../components/GracefulExitModal.component.jsx';
import useAuth from '../hooks/useAuth.hook.js';

export default function CstManagerDashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-obsidian">
      <AttendanceBanner />
      <GracefulExitModal />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10">
        <div className="flex flex-col items-center gap-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            CST Manager Dashboard
          </h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl bg-flash-secondary px-5 py-3 font-display text-sm font-semibold text-obsidian transition hover:bg-flash-primary"
          >
            Logout
          </button>
        </div>
        <AttendanceHistory />
      </div>
    </div>
  );
}
