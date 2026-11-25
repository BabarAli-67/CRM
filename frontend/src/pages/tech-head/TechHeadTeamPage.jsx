import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import {
  MENTOR_JD_OPTIONS,
  TECH_JD_OPTIONS,
  createTechMember,
  listTechTeam,
  updateTechMember,
} from '../../services/techHead.service.js';

const emptyForm = () => ({
  fullName: '',
  username: '',
  phone: '',
  email: '',
  password: '',
  jd: 'Developer',
  assignedMentorId: '',
});

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

export default function TechHeadTeamPage() {
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const {
    data: members = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techHeadTeam'],
    queryFn: listTechTeam,
  });

  const mentors = useMemo(
    () =>
      members.filter(
        (m) =>
          m.status === 'approved' &&
          MENTOR_JD_OPTIONS.includes(m.jd) &&
          String(m._id) !== String(editTarget?._id || '')
      ),
    [members, editTarget]
  );

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editTarget?._id) {
        return updateTechMember(editTarget._id, payload);
      }
      return createTechMember(payload);
    },
    onSuccess: () => {
      setFormError('');
      setComposerOpen(false);
      setEditTarget(null);
      setForm(emptyForm());
      queryClient.invalidateQueries({ queryKey: ['techHeadTeam'] });
    },
    onError: (err) => {
      setFormError(
        err?.response?.data?.message || 'Failed to save team member.'
      );
    },
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setFormError('');
    setComposerOpen(true);
  };

  const openEdit = (member) => {
    setEditTarget(member);
    setForm({
      fullName: member.fullName || '',
      username: member.username || '',
      phone: member.phone || '',
      email: member.email || '',
      password: '',
      jd: member.jd || 'Developer',
      assignedMentorId:
        member.assignedMentorId?._id || member.assignedMentorId || '',
    });
    setFormError('');
    setComposerOpen(true);
  };

  const setField = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    setFormError('');

    const username = form.username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      setFormError(
        'Username must be 3–32 characters (letters, numbers, dots, underscores, or hyphens).'
      );
      return;
    }

    const payload = {
      fullName: form.fullName.trim(),
      username,
      phone: form.phone.trim(),
      email: form.email.trim(),
      jd: form.jd,
      assignedMentorId:
        form.jd === 'Intern' ? form.assignedMentorId || undefined : null,
    };
    if (!editTarget || form.password.trim()) {
      payload.password = form.password;
    }
    if (form.jd === 'Intern' && !form.assignedMentorId) {
      setFormError('Select a Reports To / Mentor for Interns.');
      return;
    }
    saveMutation.mutate(payload);
  };

  return (
    <TechHeadShell title="Team Management">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              Team Management
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Only Tech Head (and Super Admin) can create or reassign Tech
              specialists
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            + Add Tech Member
          </button>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load team.'}
          </p>
        ) : members.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No Tech team members yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
            <table className="min-w-full text-left text-sm text-zinc-200">
              <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Full Name</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Job Description</th>
                  <th className="px-4 py-3 font-medium">Reports To</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m._id}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {m.fullName}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {m.username ? `@${m.username}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{m.phone || '—'}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {m.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{m.jd || '—'}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {m.jd === 'Intern'
                        ? m.assignedMentorId?.fullName ||
                          m.assignedMentorId?.username ||
                          '—'
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(m)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                      >
                        Edit / Reassign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-lg space-y-3 rounded-2xl border border-zinc-700 bg-[#111111] p-5 shadow-2xl"
          >
            <h3 className="font-display text-lg font-semibold text-white">
              {editTarget ? 'Edit Tech Member' : 'Create Tech Member'}
            </h3>

            <label className="block space-y-1 text-xs font-medium text-zinc-400">
              <span>Full Name</span>
              <input
                required
                value={form.fullName}
                onChange={setField('fullName')}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-zinc-400">
              <span>Username</span>
              <input
                required
                value={form.username}
                onChange={setField('username')}
                className={inputClass}
                placeholder="babarali"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9._\-]{3,32}"
                title="3–32 characters: letters, numbers, dots, underscores, or hyphens"
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-zinc-400">
              <span>Contact Number</span>
              <input
                required
                value={form.phone}
                onChange={setField('phone')}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-zinc-400">
              <span>Email</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={setField('email')}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-zinc-400">
              <span>
                Password{editTarget ? ' (leave blank to keep current)' : ''}
              </span>
              <input
                type="password"
                required={!editTarget}
                minLength={editTarget ? undefined : 8}
                value={form.password}
                onChange={setField('password')}
                className={inputClass}
                autoComplete="new-password"
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-zinc-400">
              <span>Job Description</span>
              <select
                value={form.jd}
                onChange={setField('jd')}
                className={inputClass}
              >
                {TECH_JD_OPTIONS.map((jd) => (
                  <option key={jd} value={jd}>
                    {jd}
                  </option>
                ))}
              </select>
            </label>
            {form.jd === 'Intern' ? (
              <label className="block space-y-1 text-xs font-medium text-zinc-400">
                <span>Reports To / Mentor</span>
                <select
                  required
                  value={form.assignedMentorId}
                  onChange={setField('assignedMentorId')}
                  className={inputClass}
                >
                  <option value="">Select mentor…</option>
                  {mentors.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.fullName} ({m.jd})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {formError ? (
              <p className="text-sm text-red-400" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => {
                  setComposerOpen(false);
                  setEditTarget(null);
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-lg bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </TechHeadShell>
  );
}
