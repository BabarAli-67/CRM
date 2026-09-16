import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.hook.js';

export default function TechTeamDashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-obsidian px-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        Tech Team Dashboard
      </h1>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-xl bg-flash-secondary px-5 py-3 font-display text-sm font-semibold text-obsidian transition hover:bg-flash-primary"
      >
        Logout
      </button>
    </div>
  );
}
