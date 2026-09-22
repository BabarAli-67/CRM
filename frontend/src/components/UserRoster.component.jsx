import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteUser, getAllUsers, updateUser } from '../services/admin.service.js';
import {
  ADMIN_BTN_GHOST,
  ADMIN_BTN_PRIMARY,
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_ROW,
  ADMIN_TABLE_WRAP,
  ADMIN_THEAD,
  ROLE_PILL,
  STATUS_PILLS,
} from './adminBrand.js';

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

export default function UserRoster({ readOnly = false }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({
    fullName: '',
    username: '',
    phone: '',
    role: '',
  });
  const [search, setSearch] = useState('');
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

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.status?.toLowerCase().includes(q)
    );
  }, [users, search]);

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
      username: user.username || '',
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
        username: draft.username,
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
      <div className={`flex min-h-48 items-center justify-center ${ADMIN_CARD}`}>
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF4B26] border-t-transparent"
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
        className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
      >
        {error?.response?.data?.message || 'Failed to load users.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, username, role, status…"
          className={`w-full max-w-md ${ADMIN_INPUT}`}
          aria-label="Search users"
        />
        <p className="text-xs text-zinc-500">{filteredUsers.length} users</p>
      </div>

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

      {filteredUsers.length === 0 ? (
        <div className={`${ADMIN_CARD} px-6 py-12 text-center text-zinc-400`}>
          No users found
        </div>
      ) : (
        <div className={ADMIN_TABLE_WRAP}>
          <table className="min-w-full text-left text-sm">
            <thead className={ADMIN_THEAD}>
              <tr>
                <th className="px-4 py-3 font-medium">Full Name</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {!readOnly ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isProtected = user.role === 'super_admin';
                const isEditing = editingId === user._id;
                const statusClass =
                  STATUS_PILLS[user.status] ||
                  'bg-white/5 text-zinc-300 ring-1 ring-white/10';

                return (
                  <tr key={user._id} className={ADMIN_ROW}>
                    <td className="px-4 py-4 text-white">
                      {!readOnly && isEditing ? (
                        <input
                          type="text"
                          value={draft.fullName}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, fullName: event.target.value }))
                          }
                          className={ADMIN_INPUT}
                        />
                      ) : (
                        user.fullName
                      )}
                    </td>
                    <td className="px-4 py-4 text-zinc-400">
                      {!readOnly && isEditing ? (
                        <input
                          type="text"
                          value={draft.username}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, username: event.target.value }))
                          }
                          className={ADMIN_INPUT}
                        />
                      ) : (
                        user.username
                      )}
                    </td>
                    <td className="px-4 py-4 text-zinc-400">
                      {!readOnly && isEditing ? (
                        <input
                          type="tel"
                          value={draft.phone}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, phone: event.target.value }))
                          }
                          className={ADMIN_INPUT}
                        />
                      ) : (
                        user.phone
                      )}
                    </td>
                    <td className="px-4 py-4 text-white">
                      {!readOnly && isEditing ? (
                        <select
                          value={draft.role}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, role: event.target.value }))
                          }
                          className={ADMIN_INPUT}
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={ROLE_PILL}>{formatRoleLabel(user.role)}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusClass}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    {!readOnly ? (
                      <td className="px-4 py-4">
                        {isProtected ? (
                          <span className="font-display text-xs font-semibold uppercase tracking-wide text-emerald-400">
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
                                  className={ADMIN_BTN_PRIMARY}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  disabled={updateMutation.isPending}
                                  onClick={() => setEditingId(null)}
                                  className="rounded-xl px-3 py-2 font-display text-xs font-semibold text-zinc-500 transition hover:text-white"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={deleteMutation.isPending}
                                onClick={() => startEdit(user)}
                                className={ADMIN_BTN_GHOST}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={deleteMutation.isPending || updateMutation.isPending}
                              onClick={() => handleDelete(user._id, user.fullName)}
                              className="rounded-xl border border-red-500/40 px-3 py-2 font-display text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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
