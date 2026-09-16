import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AttendanceGrid from '../components/AttendanceGrid.component.jsx';
import LateRequestsQueue from '../components/LateRequestsQueue.component.jsx';
import UserAccessManagement from '../components/UserAccessManagement.component.jsx';
import UserRoster from '../components/UserRoster.component.jsx';
import useAuth from '../hooks/useAuth.hook.js';
import { getShift, updateShift } from '../services/shift.service.js';

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const inputClassName =
  'rounded-xl border border-obsidian-border bg-obsidian-elevated px-3 py-2 text-sm text-ink outline-none focus:border-flash-secondary focus:ring-2 focus:ring-flash-secondary/30';

function ShiftSettingsPanel() {
  const queryClient = useQueryClient();
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('04:00');
  const [weekendDays, setWeekendDays] = useState([6, 0]);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['shiftSettings'],
    queryFn: getShift,
  });

  useEffect(() => {
    if (!data?.settings) return;
    setStartTime(data.settings.startTime || '19:00');
    setEndTime(data.settings.endTime || '04:00');
    setWeekendDays(
      Array.isArray(data.settings.weekendDays)
        ? [...data.settings.weekendDays]
        : [6, 0]
    );
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload) => updateShift(payload),
    onSuccess: () => {
      setFormError('');
      setFormSuccess('Shift settings saved.');
      queryClient.invalidateQueries({ queryKey: ['shiftSettings'] });
    },
    onError: (err) => {
      setFormSuccess('');
      setFormError(
        err.response?.data?.message || 'Failed to update shift settings.'
      );
    },
  });

  const toggleWeekendDay = (day) => {
    setWeekendDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = (event) => {
    event.preventDefault();
    saveMutation.mutate({
      startTime: startTime.slice(0, 5),
      endTime: endTime.slice(0, 5),
      weekendDays,
    });
  };

  return (
    <form
      onSubmit={handleSave}
      className="space-y-4 rounded-card border border-obsidian-border bg-obsidian-surface p-4 sm:p-6"
    >
      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading shift settings…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
              Start time
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className={inputClassName}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
              End time
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className={inputClassName}
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-ink-muted">
              Weekend days (Asia/Karachi)
            </legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const checked = weekendDays.includes(day.value);
                return (
                  <label
                    key={day.value}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                      checked
                        ? 'border-flash-secondary bg-flash-secondary/10 text-ink'
                        : 'border-obsidian-border text-ink-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWeekendDay(day.value)}
                      className="accent-flash-secondary"
                    />
                    {day.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {formError ? (
            <p className="text-sm text-red-400">{formError}</p>
          ) : null}
          {formSuccess ? (
            <p className="text-sm text-emerald-400">{formSuccess}</p>
          ) : null}

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-xl bg-flash-secondary px-4 py-2 font-display text-sm font-semibold text-obsidian transition hover:bg-flash-primary disabled:opacity-60"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </form>
  );
}

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

        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">
              Late Attendance Requests
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Review and approve late check-in requests from department staff
            </p>
          </div>
          <LateRequestsQueue readOnly={false} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">
              Attendance Grid
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Filter, export, and override attendance across the organization
            </p>
          </div>
          <AttendanceGrid readOnly={false} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">
              Shift Settings
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Configure organization-wide shift window and weekend days
              (Asia/Karachi)
            </p>
          </div>
          <ShiftSettingsPanel />
        </section>
      </div>
    </div>
  );
}
