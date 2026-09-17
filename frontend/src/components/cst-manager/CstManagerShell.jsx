import { NavLink, useNavigate } from 'react-router-dom';
import AttendanceBanner from '../AttendanceBanner.component.jsx';
import GracefulExitModal from '../GracefulExitModal.component.jsx';
import useAuth from '../../hooks/useAuth.hook.js';

const linkClass = ({ isActive }) =>
  [
    'rounded-lg px-3 py-2 font-display text-sm font-semibold transition',
    isActive
      ? 'bg-flash-primary text-white'
      : 'text-ink/80 hover:bg-white/10 hover:text-ink',
  ].join(' ');

export default function CstManagerShell({ title, children }) {
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

      <header className="border-b border-white/10 bg-obsidian-surface/80">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-soft">
              CST Manager
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              {title}
            </h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <NavLink to="/dashboard/cst-manager" end className={linkClass}>
              Attendance
            </NavLink>
            <NavLink
              to="/dashboard/cst-manager/handover"
              className={linkClass}
            >
              Handover Queue
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-flash-secondary px-3 py-2 font-display text-sm font-semibold text-obsidian transition hover:bg-flash-primary hover:text-white"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8">
        {children}
      </div>
    </div>
  );
}
