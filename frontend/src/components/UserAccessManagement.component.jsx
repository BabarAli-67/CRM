import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveUser,
  getPendingUsers,
  rejectUser,
  resetUserPassword,
} from '../services/admin.service.js';

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
      <div className="flex min-h-48 items-center justify-center rounded-card border border-obsidian-border bg-obsidian-surface">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-flash-secondary border-t-transparent"
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
        className="rounded-card border border-flash-primary/40 bg-flash-primary/10 px-4 py-3 text-sm text-flash-secondary"
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
          className="rounded-xl border border-flash-primary/40 bg-flash-primary/10 px-4 py-3 text-sm text-flash-secondary"
        >
          {actionError}
        </div>
      ) : null}

      {actionSuccess ? (
        <div
          role="status"
          className="rounded-xl border border-flash-tertiary/40 bg-flash-tertiary/10 px-4 py-3 text-sm text-ink"
        >
          {actionSuccess}
        </div>
      ) : null}

      {users.length === 0 ? (
        <div className="rounded-card border border-obsidian-border bg-obsidian-surface px-6 py-12 text-center text-ink-muted">
          No pending requests
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-obsidian-border bg-obsidian-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-obsidian-border bg-obsidian-elevated font-display text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Full Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Requested At</th>
                <th className="px-4 py-3 font-medium">Role</th>
                {!readOnly ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const selectedRole = selectedRoles[user._id] || '';
                const isResetting = resetTargetId === user._id;

                return (
                  <tr key={user._id} className="border-b border-obsidian-border last:border-b-0">
                    <td className="px-4 py-4 text-ink">{user.fullName}</td>
                    <td className="px-4 py-4 text-ink-muted">{user.email}</td>
                    <td className="px-4 py-4 text-ink-muted">{user.phone}</td>
                    <td className="px-4 py-4 text-ink-muted">
                      {formatRequestedAt(user.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      {readOnly ? (
                        <span className="text-ink">{formatRoleLabel(user.role)}</span>
                      ) : (
                        <select
                          value={selectedRole}
                          onChange={(event) =>
                            setSelectedRoles((prev) => ({
                              ...prev,
                              [user._id]: event.target.value,
                            }))
                          }
                          className="min-w-44 rounded-xl border border-obsidian-border bg-obsidian-elevated px-3 py-2 text-ink outline-none focus:border-flash-secondary focus:ring-2 focus:ring-flash-secondary/30"
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
                              className="rounded-xl bg-flash-tertiary px-3 py-2 font-display text-xs font-semibold text-obsidian transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Approve & Activate
                            </button>
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => rejectMutation.mutate(user._id)}
                              className="rounded-xl border border-flash-primary/50 px-3 py-2 font-display text-xs font-semibold text-flash-secondary transition hover:bg-flash-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
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
                              className="rounded-xl border border-obsidian-border px-3 py-2 font-display text-xs font-semibold text-ink transition hover:border-flash-secondary hover:text-flash-secondary disabled:cursor-not-allowed disabled:opacity-50"
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
                                className="min-w-48 flex-1 rounded-xl border border-obsidian-border bg-obsidian-elevated px-3 py-2 text-ink outline-none placeholder:text-ink-soft focus:border-flash-secondary focus:ring-2 focus:ring-flash-secondary/30"
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
                                className="rounded-xl bg-flash-secondary px-3 py-2 font-display text-xs font-semibold text-obsidian transition hover:bg-flash-primary disabled:cursor-not-allowed disabled:opacity-50"
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
                                className="rounded-xl px-3 py-2 font-display text-xs font-semibold text-ink-muted transition hover:text-ink"
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
