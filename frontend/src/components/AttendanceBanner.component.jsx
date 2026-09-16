import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useShiftClock from '../hooks/useShiftClock.hook.js';
import {
  checkIn,
  checkOut,
  getTodayStatus,
  submitLateRequest,
} from '../services/attendance.service.js';

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
    <p className="mt-2 text-sm text-red-700">{actionError}</p>
  ) : null;

  if (
    (attendance.status === 'present' || attendance.status === 'late') &&
    !attendance.checkOutTime
  ) {
    return (
      <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">
            Checked in at {formatTime(attendance.checkInTime)}
            {attendance.status === 'late' ? ' (late)' : ''}
          </p>
          <button
            type="button"
            onClick={() => checkOutMutation.mutate()}
            disabled={checkOutMutation.isPending}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
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
    const withinWindow = now() < shiftStartAt;

    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
        <div className="mx-auto max-w-5xl">
          <p className="text-base font-semibold">
            {withinWindow
              ? 'Mark your attendance for today’s shift'
              : 'On-time check-in window has closed'}
          </p>
          <p className="mt-1 text-sm text-amber-900/80">
            Shift starts at {formatTime(attendance.shiftStartAt)}.
          </p>

          {withinWindow ? (
            <button
              type="button"
              onClick={() => checkInMutation.mutate()}
              disabled={checkInMutation.isPending}
              className="mt-3 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {checkInMutation.isPending ? 'Marking…' : 'Mark Attendance'}
            </button>
          ) : (
            <div className="mt-3">
              {!showLateForm ? (
                <button
                  type="button"
                  onClick={() => setShowLateForm(true)}
                  className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
                >
                  Request Attendance
                </button>
              ) : (
                <div className="max-w-lg space-y-2">
                  <label
                    htmlFor="late-reason"
                    className="block text-sm font-medium"
                  >
                    Reason Note
                  </label>
                  <textarea
                    id="late-reason"
                    rows={3}
                    value={lateReason}
                    onChange={(e) => setLateReason(e.target.value)}
                    placeholder="Explain why you are late (5–300 characters)"
                    className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => lateMutation.mutate(lateReason.trim())}
                    disabled={
                      lateMutation.isPending || lateReason.trim().length < 5
                    }
                    className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
                  >
                    {lateMutation.isPending ? 'Submitting…' : 'Submit Request'}
                  </button>
                </div>
              )}
            </div>
          )}
          {errorLine}
        </div>
      </div>
    );
  }

  if (attendance.status === 'pending_approval') {
    return (
      <div className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-slate-800">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-medium">
            Your late attendance request is awaiting Super Admin review
          </p>
          {attendance.lateReason ? (
            <p className="mt-1 text-sm text-slate-600">
              Reason: {attendance.lateReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (attendance.status === 'absent') {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-red-900">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold">
            You have been marked absent for today
          </p>
          {attendance.forcedAbsentReason ? (
            <p className="mt-1 text-sm text-red-800/80">
              Reason: {attendance.forcedAbsentReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
