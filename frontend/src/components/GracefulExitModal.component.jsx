import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.hook.js';
import useShiftClock from '../hooks/useShiftClock.hook.js';
import { checkOut, extendShift, getTodayStatus } from '../services/attendance.service.js';

/** Mirror backend getShiftWindowForDate end-time crossing (Asia/Karachi wall clock). */
const deriveShiftEndAt = (shiftDate, settings, fallbackIso) => {
  if (fallbackIso) {
    return new Date(fallbackIso);
  }

  if (!shiftDate || !settings?.startTime || !settings?.endTime) {
    return null;
  }

  const [startH, startM] = settings.startTime.split(':').map(Number);
  const [endH, endM] = settings.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let end = new Date(`${shiftDate}T${settings.endTime}:00+05:00`);
  if (endMinutes <= startMinutes) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return end;
};

const formatCountdown = (remainingMs) => {
  const clamped = Math.max(0, remainingMs);
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function GracefulExitModal() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const { settings, now, loading: clockLoading } = useShiftClock();
  const [, setTick] = useState(0);
  const autoTriggeredRef = useRef(false);

  const { data } = useQuery({
    queryKey: ['todayAttendance'],
    queryFn: getTodayStatus,
    refetchInterval: 15000,
  });

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const attendance = data?.attendance;

  const shiftEndAt = useMemo(
    () =>
      deriveShiftEndAt(
        attendance?.shiftDate,
        settings,
        attendance?.shiftEndAt
      ),
    [attendance?.shiftDate, attendance?.shiftEndAt, settings]
  );

  const effectiveCutoff = useMemo(() => {
    if (!shiftEndAt) return null;
    if (attendance?.extendedUntil) {
      return new Date(attendance.extendedUntil);
    }
    return new Date(shiftEndAt.getTime() + 90_000);
  }, [attendance?.extendedUntil, shiftEndAt]);

  const serverNow = now();
  const nowMs = serverNow.getTime();
  const remainingMs = effectiveCutoff ? effectiveCutoff.getTime() - nowMs : 0;

  const inActiveSession =
    attendance &&
    (attendance.status === 'present' || attendance.status === 'late') &&
    !attendance.checkOutTime &&
    shiftEndAt &&
    effectiveCutoff;

  const windowStartMs = shiftEndAt ? shiftEndAt.getTime() - 90_000 : 0;
  const withinExitWindow =
    inActiveSession &&
    nowMs >= windowStartMs &&
    nowMs <= effectiveCutoff.getTime();

  const invalidateToday = () =>
    queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });

  const logOutNowMutation = useMutation({
    mutationFn: checkOut,
    onSuccess: () => {
      invalidateToday();
      logout();
      navigate('/login', { replace: true });
    },
  });

  const extendMutation = useMutation({
    mutationFn: extendShift,
    onSuccess: () => {
      autoTriggeredRef.current = false;
      invalidateToday();
    },
  });

  useEffect(() => {
    if (!inActiveSession || !effectiveCutoff) return;
    if (nowMs < effectiveCutoff.getTime()) return;
    if (autoTriggeredRef.current || logOutNowMutation.isPending) return;

    autoTriggeredRef.current = true;
    logOutNowMutation.mutate();
  }, [
    effectiveCutoff,
    inActiveSession,
    logOutNowMutation,
    nowMs,
  ]);

  if (clockLoading || !withinExitWindow) {
    return null;
  }

  const canExtend = !attendance.extendedUntil;
  const actionError =
    logOutNowMutation.error?.response?.data?.message ||
    extendMutation.error?.response?.data?.message ||
    '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="graceful-exit-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2
          id="graceful-exit-title"
          className="text-lg font-semibold text-slate-900"
        >
          Shift ending
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Your shift window is closing. Log out now, or extend once by 30
          minutes. Auto checkout runs when the timer hits zero.
        </p>

        <p className="mt-6 text-center font-mono text-4xl font-semibold tracking-widest text-slate-900">
          {formatCountdown(remainingMs)}
        </p>
        <p className="mt-1 text-center text-xs text-slate-500">
          Time remaining until forced checkout
        </p>

        {actionError ? (
          <p className="mt-3 text-sm text-red-600">{actionError}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {canExtend ? (
            <button
              type="button"
              onClick={() => extendMutation.mutate()}
              disabled={extendMutation.isPending || logOutNowMutation.isPending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {extendMutation.isPending ? 'Extending…' : 'Extend 30 Minutes'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => logOutNowMutation.mutate()}
            disabled={logOutNowMutation.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {logOutNowMutation.isPending ? 'Logging out…' : 'Log Out Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
