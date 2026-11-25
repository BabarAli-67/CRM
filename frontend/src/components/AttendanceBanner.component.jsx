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

const bannerShell =
  'border-b border-[#222222] bg-[#0A0A0A] px-4 py-4 text-white';

const bannerCard =
  'mx-auto max-w-7xl rounded-xl border border-white/15 bg-[#111111] px-4 py-4 sm:px-5 border-l-4 border-l-[#F25E26]';

const ctaClass =
  'cursor-pointer rounded-xl bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff6a36] disabled:cursor-not-allowed disabled:opacity-60';

const secondaryBtnClass =
  'cursor-pointer rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/5 disabled:opacity-60';

/**
 * Attendance strip — Matte Black + White + Flash Orange only.
 * No amber / emerald / muddy washes.
 */
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

  const invalidateToday = () => {
    queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });
    queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
  };

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
    <p className="mt-2 text-sm text-[#F25E26]" role="alert">
      {actionError}
    </p>
  ) : null;

  if (
    (attendance.status === 'present' || attendance.status === 'late') &&
    !attendance.checkOutTime
  ) {
    return (
      <div className={bannerShell}>
        <div className={`${bannerCard} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <p className="text-sm font-semibold text-white">On duty</p>
            <p className="mt-0.5 text-sm text-[#A3A3A3]">
              Checked in at {formatTime(attendance.checkInTime)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => checkOutMutation.mutate()}
            disabled={checkOutMutation.isPending}
            className={secondaryBtnClass}
          >
            {checkOutMutation.isPending ? 'Checking out…' : 'Check Out'}
          </button>
        </div>
        {errorLine ? <div className="mx-auto mt-2 max-w-7xl px-1">{errorLine}</div> : null}
      </div>
    );
  }

  if (attendance.status === 'auto_absent') {
    const shiftStartAt = new Date(attendance.shiftStartAt);
    const checkInOpensAt = attendance.checkInOpensAt
      ? new Date(attendance.checkInOpensAt)
      : new Date(shiftStartAt.getTime() - 20 * 60 * 1000);
    const checkInClosesAt = attendance.checkInClosesAt
      ? new Date(attendance.checkInClosesAt)
      : shiftStartAt;
    const isTechShift = attendance.shiftProfile === 'tech';
    const current = now();
    const beforeCheckInOpens = current < checkInOpensAt;
    // Inclusive close (Tech: through 06:10 PM PKT)
    const withinOnTimeWindow =
      current >= checkInOpensAt && current <= checkInClosesAt;
    const afterOnTimeWindow = current > checkInClosesAt;

    return (
      <div className={bannerShell}>
        <div className={bannerCard}>
          {beforeCheckInOpens ? (
            <>
              <p className="text-base font-semibold text-white">
                Check-in not open yet
              </p>
              <p className="mt-1 text-sm text-[#A3A3A3]">
                {isTechShift
                  ? `Tech check-in opens at shift start (${formatTime(checkInOpensAt)}). On-time window runs until ${formatTime(checkInClosesAt)}.`
                  : `Check-in opens 20 minutes before shift (at ${formatTime(checkInOpensAt)}). Shift starts at ${formatTime(attendance.shiftStartAt)}.`}
              </p>
            </>
          ) : withinOnTimeWindow ? (
            <>
              <p className="text-base font-semibold text-white">
                Mark your attendance for today’s shift
              </p>
              <p className="mt-1 text-sm text-[#A3A3A3]">
                {isTechShift
                  ? `On-time window: ${formatTime(checkInOpensAt)} – ${formatTime(checkInClosesAt)} PKT.`
                  : `Shift starts at ${formatTime(attendance.shiftStartAt)}.`}
              </p>
              <button
                type="button"
                onClick={() => checkInMutation.mutate()}
                disabled={checkInMutation.isPending}
                className={`mt-3 ${ctaClass}`}
              >
                {checkInMutation.isPending ? 'Marking…' : 'Mark Attendance'}
              </button>
            </>
          ) : afterOnTimeWindow ? (
            <>
              <p className="text-base font-semibold text-white">
                On-time check-in window has closed
              </p>
              <p className="mt-1 text-sm text-[#A3A3A3]">
                {isTechShift
                  ? `On-time window closed at ${formatTime(checkInClosesAt)}. Request attendance for Super Admin review.`
                  : `Shift started at ${formatTime(attendance.shiftStartAt)}.`}
              </p>
              <div className="mt-3">
                {!showLateForm ? (
                  <button
                    type="button"
                    onClick={() => setShowLateForm(true)}
                    className={ctaClass}
                  >
                    Request Attendance
                  </button>
                ) : (
                  <div className="max-w-lg space-y-2">
                    <label
                      htmlFor="late-reason"
                      className="block text-sm font-medium text-white"
                    >
                      Reason Note
                    </label>
                    <textarea
                      id="late-reason"
                      rows={3}
                      value={lateReason}
                      onChange={(e) => setLateReason(e.target.value)}
                      placeholder="Explain why you are late (5–300 characters)"
                      className="w-full rounded-lg border border-white/15 bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none placeholder:text-[#A3A3A3] focus:border-[#F25E26]/60 focus:ring-1 focus:ring-[#F25E26]/30"
                    />
                    <button
                      type="button"
                      onClick={() => lateMutation.mutate(lateReason.trim())}
                      disabled={
                        lateMutation.isPending || lateReason.trim().length < 5
                      }
                      className={ctaClass}
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
      <div className={bannerShell}>
        <div className={bannerCard}>
          <p className="text-sm font-semibold text-white">
            Your late attendance request is awaiting Super Admin review
          </p>
          {attendance.lateReason ? (
            <p className="mt-1 text-sm text-[#A3A3A3]">
              Reason: {attendance.lateReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (attendance.status === 'absent') {
    return (
      <div className={bannerShell}>
        <div className={bannerCard}>
          <p className="text-sm font-semibold text-white">
            You have been marked absent for today
          </p>
          {attendance.forcedAbsentReason ? (
            <p className="mt-1 text-sm text-[#A3A3A3]">
              Reason: {attendance.forcedAbsentReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
