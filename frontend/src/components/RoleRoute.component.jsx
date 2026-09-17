import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.hook.js';
import { ReminderPopupHost } from './alerts/ReminderPopup.jsx';

export default function RoleRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.isAdmin) {
    return (
      <>
        <ReminderPopupHost />
        {children}
      </>
    );
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <>
      <ReminderPopupHost />
      {children}
    </>
  );
}
