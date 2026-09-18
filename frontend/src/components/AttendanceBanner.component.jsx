import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useShiftClock from '../hooks/useShiftClock.hook.js';
import {
  checkIn,
  checkOut,
  getTodayStatus,
  submitLateRequest,
} from '../services/attendance.service.js';

/** Minutes before dynamic shift.startTime when Mark Attendance becomes available. */
const CHECK_IN_EARLY_MINUTES = 20;

const formatTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: 'short',
  });
};

export default function AttendanceBanner() {
  const queryClient = useQueryClient();
  const { now, loading: clockLoading } = useShiftClock();
  const [showLateForm, setShowLateForm] = useState(false);
  const [lateReason, setLateReason] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['todayAttendance'],
    queryFn: getTodayStatus,
    refetchInterval: 30000,
  });

  const invalidateToday = () =>
    queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });

  const checkInMutation = useMutation({
    mutationFn: checkIn,
    onSuccess: () => {
      setActionError('');
      invalidateToday();
    },
    onError: (err) => {
      setActionError(err.response?.data?.message || 'Failed to check in.');
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: checkOut,
    onSuccess: () => {
      setActionError('');
      invalidateToday();
    },
    onError: (err) => {
      setActionError(err.response?.data?.message || 'Failed to check out.');
    },
  });

  const lateMutation = useMutation({
    mutationFn: (reason) => submitLateRequest(reason),
    onSuccess: () => {
      setActionError('');
      setLateReason('');
      setShowLateForm(false);
      invalidateToday();
    },
    onError: (err) => {
      setActionError(
        err.response?.data?.message || 'Failed to submit late request.'
      );
    },
  });

  if (isLoading || clockLoading || !data?.attendance) {
    return null;
  }

  const { attendance } = data;

  if (attendance.status === 'weekend_off') {
    return null;
  }

  if (attendance.checkOutTime) {
    return null;
  }

  const errorLine = actionError ? (
    <p className="mt-2 text-sm text-red-400">{actionError}</p>
  ) : null;

  if (
    (attendance.status === 'present' || attendance.status === 'late') &&
    !attendance.checkOutTime
  ) {
    return (
      <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-2 sm:px-4">
          <p className="text-sm font-medium">
            Checked in at {formatTime(attendance.checkInTime)}
            {attendance.status === 'late' ? ' (late)' : ''}
          </p>
          <button
            type="button"
            onClick={() => checkOutMutation.mutate()}
            disabled={checkOutMutation.isPending}
            className="cursor-pointer rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {checkOutMutation.isPending ? 'Checking out…' : 'Check Out'}
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  if (attendance.status === 'auto_absent') {
    const shiftStartAt = new Date(attendance.shiftStartAt);
    const checkInOpensAt = new Date(
      shiftStartAt.getTime() - CHECK_IN_EARLY_MINUTES * 60 * 1000
    );
    const current = now();
    const beforeCheckInOpens = current < checkInOpensAt;
    const withinOnTimeWindow =
      current >= checkInOpensAt && current < shiftStartAt;
    const afterShiftStart = current >= shiftStartAt;

    return (
      <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-4 text-amber-100">
        <div className="mx-auto max-w-7xl px-2 sm:px-4">
          {beforeCheckInOpens ? (
            <>
              <p className="text-base font-semibold">Check-in not open yet</p>
              <p className="mt-1 text-sm text-amber-200/80">
                Check-in opens 20 minutes before shift (at{' '}
                {formatTime(checkInOpensAt)}). Shift starts at{' '}
                {formatTime(attendance.shiftStartAt)}.
              </p>
            </>
          ) : withinOnTimeWindow ? (
            <>
              <p className="text-base font-semibold">
                Mark your attendance for today’s shift
              </p>
              <p className="mt-1 text-sm text-amber-200/80">
                Shift starts at {formatTime(attendance.shiftStartAt)}.
              </p>
              <button
                type="button"
                onClick={() => checkInMutation.mutate()}
                disabled={checkInMutation.isPending}
                className="mt-3 cursor-pointer rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-60"
              >
                {checkInMutation.isPending ? 'Marking…' : 'Mark Attendance'}
              </button>
            </>
          ) : afterShiftStart ? (
            <>
              <p className="text-base font-semibold">
                On-time check-in window has closed
              </p>
              <p className="mt-1 text-sm text-amber-200/80">
                Shift started at {formatTime(attendance.shiftStartAt)}.
              </p>
              <div className="mt-3">
                {!showLateForm ? (
                  <button
                    type="button"
                    onClick={() => setShowLateForm(true)}
                    className="cursor-pointer rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500"
                  >
                    Request Attendance
                  </button>
                ) : (
                  <div className="max-w-lg space-y-2">
                    <label
                      htmlFor="late-reason"
                      className="block text-sm font-medium text-amber-100"
                    >
                      Reason Note
                    </label>
                    <textarea
                      id="late-reason"
                      rows={3}
                      value={lateReason}
                      onChange={(e) => setLateReason(e.target.value)}
                      placeholder="Explain why you are late (5–300 characters)"
                      className="w-full rounded-lg border border-amber-500/30 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40"
                    />
                    <button
                      type="button"
                      onClick={() => lateMutation.mutate(lateReason.trim())}
                      disabled={
                        lateMutation.isPending || lateReason.trim().length < 5
                      }
                      className="cursor-pointer rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-60"
                    >
                      {lateMutation.isPending ? 'Submitting…' : 'Submit Request'}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
          {errorLine}
        </div>
      </div>
    );
  }

  if (attendance.status === 'pending_approval') {
    return (
      <div className="border-b border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-zinc-200">
        <div className="mx-auto max-w-7xl px-2 sm:px-4">
          <p className="text-sm font-medium">
            Your late attendance request is awaiting Super Admin review
          </p>
          {attendance.lateReason ? (
            <p className="mt-1 text-sm text-zinc-400">
              Reason: {attendance.lateReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (attendance.status === 'absent') {
    return (
      <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-red-100">
        <div className="mx-auto max-w-7xl px-2 sm:px-4">
          <p className="text-sm font-semibold">
            You have been marked absent for today
          </p>
          {attendance.forcedAbsentReason ? (
            <p className="mt-1 text-sm text-red-200/80">
              Reason: {attendance.forcedAbsentReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
