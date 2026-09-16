import UserAccessManagement from '../components/UserAccessManagement.component.jsx';
import UserRoster from '../components/UserRoster.component.jsx';
import useAuth from '../hooks/useAuth.hook.js';

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-obsidian px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-obsidian-border bg-obsidian-surface px-6 py-5">
          <div>
            <p className="font-display text-sm font-bold italic tracking-wide text-flash-primary">
              FLASH TECH
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Admin Dashboard — User Access Management
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Review pending registrations and manage every account in the system
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted">{user?.fullName || user?.email}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-obsidian-border px-4 py-2 font-display text-sm font-semibold text-ink transition hover:border-flash-secondary hover:text-flash-secondary"
            >
              Log out
            </button>
          </div>
        </header>

        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">Pending Approvals</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Approve or reject new registration requests
            </p>
          </div>
          <UserAccessManagement readOnly={false} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">All System Users</h2>
            <p className="mt-1 text-sm text-ink-muted">
              View and manage accounts across every role and status
            </p>
          </div>
          <UserRoster readOnly={false} />
        </section>
      </div>
    </div>
  );
}
