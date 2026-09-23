import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.hook.js';
import { ReminderPopupHost } from './alerts/ReminderPopup.jsx';

/**
 * Gate by exact role.
 * - Empty `allowedRoles`: any authenticated user
 * - Super Admin must not bypass department routes — lead APIs are role-scoped
 *   (`POST /leads` is `sales_agent` only) and would 403 after a misleading UI.
 */
export default function RoleRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0C0E] text-sm text-zinc-500">
        Loading session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [];
  if (allowed.length > 0 && !allowed.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <>
      <ReminderPopupHost />
      {children}
    </>
  );
}
