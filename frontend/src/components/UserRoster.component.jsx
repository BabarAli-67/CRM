import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteUser, getAllUsers, updateUser } from '../services/admin.service.js';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin (Auditor)' },
  { value: 'sales_agent', label: 'Sales Agent' },
  { value: 'closer', label: 'Closer' },
  { value: 'cst_manager', label: 'CST Manager' },
  { value: 'tech_team', label: 'Tech Team Member' },
];

const formatRoleLabel = (role) => {
  if (!role) return 'Unassigned';
  if (role === 'super_admin') return 'Super Admin';
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
};

const inputClassName =
  'w-full min-w-36 rounded-xl border border-obsidian-border bg-obsidian-elevated px-3 py-2 text-ink outline-none focus:border-flash-secondary focus:ring-2 focus:ring-flash-secondary/30';

export default function UserRoster({ readOnly = false }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: '',
  });
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const {
    data: users = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => getAllUsers(),
  });

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['allUsers'] });

  const updateMutation = useMutation({
    mutationFn: ({ userId, payload }) => updateUser(userId, payload),
    onSuccess: () => {
      setActionError('');
      setActionSuccess('User profile updated successfully.');
      setEditingId(null);
      invalidateUsers();
    },
    onError: (err) => {
      setActionSuccess('');
      setActionError(err.response?.data?.message || 'Failed to update user.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId) => deleteUser(userId),
    onSuccess: () => {
      setActionError('');
      setActionSuccess('User deleted successfully.');
      invalidateUsers();
    },
    onError: (err) => {
      setActionSuccess('');
      setActionError(err.response?.data?.message || 'Failed to delete user.');
    },
  });

  const startEdit = (user) => {
    setEditingId(user._id);
    setDraft({
      fullName: user.fullName || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role && user.role !== 'super_admin' ? user.role : 'sales_agent',
    });
    setActionError('');
    setActionSuccess('');
  };

  const handleSave = (userId) => {
    updateMutation.mutate({
      userId,
      payload: {
        fullName: draft.fullName,
        email: draft.email,
        phone: draft.phone,
        role: draft.role,
      },
    });
  };

  const handleDelete = (userId, fullName) => {
    const confirmed = window.confirm(
      `Delete ${fullName || 'this user'}? This cannot be undone.`
    );
    if (!confirmed) return;
    deleteMutation.mutate(userId);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-card border border-obsidian-border bg-obsidian-surface">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-flash-secondary border-t-transparent"
          role="status"
          aria-label="Loading users"
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
        {error?.response?.data?.message || 'Failed to load users.'}
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
          No users found
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-obsidian-border bg-obsidian-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-obsidian-border bg-obsidian-elevated font-display text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Full Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {!readOnly ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isProtected = user.role === 'super_admin';
                const isEditing = editingId === user._id;

                return (
                  <tr key={user._id} className="border-b border-obsidian-border last:border-b-0">
                    <td className="px-4 py-4 text-ink">
                      {!readOnly && isEditing ? (
                        <input
                          type="text"
                          value={draft.fullName}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, fullName: event.target.value }))
                          }
                          className={inputClassName}
                        />
                      ) : (
                        user.fullName
                      )}
                    </td>
                    <td className="px-4 py-4 text-ink-muted">
                      {!readOnly && isEditing ? (
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, email: event.target.value }))
                          }
                          className={inputClassName}
                        />
                      ) : (
                        user.email
                      )}
                    </td>
                    <td className="px-4 py-4 text-ink-muted">
                      {!readOnly && isEditing ? (
                        <input
                          type="tel"
                          value={draft.phone}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, phone: event.target.value }))
                          }
                          className={inputClassName}
                        />
                      ) : (
                        user.phone
                      )}
                    </td>
                    <td className="px-4 py-4 text-ink">
                      {!readOnly && isEditing ? (
                        <select
                          value={draft.role}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, role: event.target.value }))
                          }
                          className={inputClassName}
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        formatRoleLabel(user.role)
                      )}
                    </td>
                    <td className="px-4 py-4 capitalize text-ink-muted">{user.status}</td>
                    {!readOnly ? (
                      <td className="px-4 py-4">
                        {isProtected ? (
                          <span className="font-display text-xs font-semibold uppercase tracking-wide text-flash-tertiary">
                            Protected
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={updateMutation.isPending}
                                  onClick={() => handleSave(user._id)}
                                  className="rounded-xl bg-flash-tertiary px-3 py-2 font-display text-xs font-semibold text-obsidian transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  disabled={updateMutation.isPending}
                                  onClick={() => setEditingId(null)}
                                  className="rounded-xl px-3 py-2 font-display text-xs font-semibold text-ink-muted transition hover:text-ink"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={deleteMutation.isPending}
                                onClick={() => startEdit(user)}
                                className="rounded-xl border border-obsidian-border px-3 py-2 font-display text-xs font-semibold text-ink transition hover:border-flash-secondary hover:text-flash-secondary disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={deleteMutation.isPending || updateMutation.isPending}
                              onClick={() => handleDelete(user._id, user.fullName)}
                              className="rounded-xl border border-flash-primary/50 px-3 py-2 font-display text-xs font-semibold text-flash-secondary transition hover:bg-flash-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
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
