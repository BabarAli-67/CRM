import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveUser,
  getPendingUsers,
  rejectUser,
  resetUserPassword,
} from '../services/admin.service.js';
import {
  ADMIN_BTN_GHOST,
  ADMIN_BTN_PRIMARY,
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_ROW,
  ADMIN_TABLE_WRAP,
  ADMIN_THEAD,
} from './adminBrand.js';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin (Auditor)' },
  { value: 'sales_agent', label: 'Sales Agent' },
  { value: 'closer', label: 'Closer' },
  { value: 'cst_manager', label: 'CST Manager' },
  { value: 'tech_team', label: 'Tech Team Member' },
];

const formatRequestedAt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

const formatRoleLabel = (role) => {
  if (!role) return 'Unassigned';
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
};

export default function UserAccessManagement({ readOnly = false }) {
  const queryClient = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState({});
  const [resetTargetId, setResetTargetId] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const {
    data: users = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['pendingUsers'],
    queryFn: getPendingUsers,
  });

  const invalidatePendingUsers = () =>
    queryClient.invalidateQueries({ queryKey: ['pendingUsers'] });

  const approveMutation = useMutation({
    mutationFn: ({ userId, role }) => approveUser(userId, role),
    onSuccess: () => {
      setActionError('');
      setActionSuccess('User approved and activated successfully.');
      invalidatePendingUsers();
    },
    onError: (err) => {
      setActionSuccess('');
      setActionError(err.response?.data?.message || 'Failed to approve user.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (userId) => rejectUser(userId),
    onSuccess: () => {
      setActionError('');
      setActionSuccess('User rejected successfully.');
      invalidatePendingUsers();
    },
    onError: (err) => {
      setActionSuccess('');
      setActionError(err.response?.data?.message || 'Failed to reject user.');
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({ userId, newPassword }) => resetUserPassword(userId, newPassword),
    onSuccess: (data) => {
      setActionError('');
      setActionSuccess(data.message || 'Password reset successfully.');
      setResetTargetId(null);
      setResetPassword('');
    },
    onError: (err) => {
      setActionSuccess('');
      setActionError(err.response?.data?.message || 'Failed to reset password.');
    },
  });

  const isMutating = useMemo(
    () =>
      approveMutation.isPending || rejectMutation.isPending || resetMutation.isPending,
    [approveMutation.isPending, rejectMutation.isPending, resetMutation.isPending]
  );

  if (isLoading) {
    return (
      <div className={`flex min-h-48 items-center justify-center ${ADMIN_CARD}`}>
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF4B26] border-t-transparent"
          role="status"
          aria-label="Loading pending users"
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
      >
        {error?.response?.data?.message || 'Failed to load pending users.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {actionError}
        </div>
      ) : null}

      {actionSuccess ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          {actionSuccess}
        </div>
      ) : null}

      {users.length === 0 ? (
        <div className={`${ADMIN_CARD} px-6 py-12 text-center text-zinc-400`}>
          No pending requests
        </div>
      ) : (
        <div className={ADMIN_TABLE_WRAP}>
          <table className="min-w-full text-left text-sm">
            <thead className={ADMIN_THEAD}>
              <tr>
                <th className="px-4 py-3 font-medium">Full Name</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Requested At</th>
                <th className="px-4 py-3 font-medium">Role</th>
                {!readOnly ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const selectedRole =
                  selectedRoles[user._id] || user.requestedRole || '';
                const isResetting = resetTargetId === user._id;

                return (
                  <tr key={user._id} className={ADMIN_ROW}>
                    <td className="px-4 py-4 text-white">{user.fullName}</td>
                    <td className="px-4 py-4 text-zinc-400">{user.username}</td>
                    <td className="px-4 py-4 text-zinc-400">{user.phone}</td>
                    <td className="px-4 py-4 text-zinc-400">
                      {formatRequestedAt(user.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      {readOnly ? (
                        <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-200">
                          {formatRoleLabel(user.role)}
                        </span>
                      ) : (
                        <select
                          value={selectedRole}
                          onChange={(event) =>
                            setSelectedRoles((prev) => ({
                              ...prev,
                              [user._id]: event.target.value,
                            }))
                          }
                          className={`min-w-44 ${ADMIN_INPUT}`}
                        >
                          <option value="">Select role</option>
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    {!readOnly ? (
                      <td className="px-4 py-4">
                        <div className="flex min-w-72 flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!selectedRole || isMutating}
                              onClick={() =>
                                approveMutation.mutate({
                                  userId: user._id,
                                  role: selectedRole,
                                })
                              }
                              className={ADMIN_BTN_PRIMARY}
                            >
                              Approve & Activate
                            </button>
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => rejectMutation.mutate(user._id)}
                              className={ADMIN_BTN_GHOST}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => {
                                setResetTargetId(user._id);
                                setResetPassword('');
                                setActionError('');
                                setActionSuccess('');
                              }}
                              className={ADMIN_BTN_GHOST}
                            >
                              Reset Password
                            </button>
                          </div>

                          {isResetting ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="password"
                                minLength={8}
                                value={resetPassword}
                                onChange={(event) => setResetPassword(event.target.value)}
                                placeholder="New password (min 8)"
                                className={`min-w-48 flex-1 ${ADMIN_INPUT}`}
                              />
                              <button
                                type="button"
                                disabled={resetPassword.length < 8 || isMutating}
                                onClick={() =>
                                  resetMutation.mutate({
                                    userId: user._id,
                                    newPassword: resetPassword,
                                  })
                                }
                                className={ADMIN_BTN_PRIMARY}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => {
                                  setResetTargetId(null);
                                  setResetPassword('');
                                }}
                                className="rounded-xl px-3 py-2 font-display text-xs font-semibold text-zinc-500 transition hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
