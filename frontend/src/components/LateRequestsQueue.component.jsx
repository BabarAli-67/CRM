import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveAttendance,
  getLateQueue,
} from '../services/attendance.service.js';
import {
  ADMIN_BTN_PRIMARY,
  ADMIN_CARD,
  ADMIN_ROW,
  ADMIN_TABLE_WRAP,
  ADMIN_THEAD,
} from './adminBrand.js';

const formatSubmittedAt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function LateRequestsQueue({ readOnly = false }) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const {
    data: requests = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['lateRequests'],
    queryFn: getLateQueue,
    refetchInterval: 30000,
  });

  const invalidateQueues = () => {
    queryClient.invalidateQueries({ queryKey: ['lateRequests'] });
    queryClient.invalidateQueries({ queryKey: ['attendanceGrid'] });
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, decision }) => approveAttendance(id, decision),
    onSuccess: (_data, variables) => {
      setActionError('');
      setActionSuccess(
        variables.decision === 'present'
          ? 'Request approved as present.'
          : 'Request approved as late.'
      );
      invalidateQueues();
    },
    onError: (err) => {
      setActionSuccess('');
      setActionError(
        err.response?.data?.message || 'Failed to approve attendance request.'
      );
    },
  });

  return (
    <div className="space-y-4">
      {actionError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {actionError}
        </p>
      ) : null}
      {actionSuccess ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {actionSuccess}
        </p>
      ) : null}

      {isLoading ? (
        <div className={`${ADMIN_CARD} py-8 text-center text-sm text-zinc-400`}>
          Loading…
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-400">
          {error?.response?.data?.message || 'Failed to load late requests.'}
        </p>
      ) : requests.length === 0 ? (
        <div className={`${ADMIN_CARD} py-8 text-center text-sm text-zinc-400`}>
          No pending late attendance requests.
        </div>
      ) : (
        <div className={ADMIN_TABLE_WRAP}>
          <table className="min-w-full text-left text-sm text-white">
            <thead className={ADMIN_THEAD}>
              <tr>
                <th className="px-3 py-3 font-medium">Employee</th>
                <th className="px-3 py-3 font-medium">Submitted At</th>
                <th className="px-3 py-3 font-medium">Reason Note</th>
                {!readOnly ? (
                  <th className="px-3 py-3 font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const busy =
                  approveMutation.isPending &&
                  approveMutation.variables?.id === request._id;

                return (
                  <tr key={request._id} className={`${ADMIN_ROW} align-top`}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-medium text-white">
                        {request.user?.fullName || '—'}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {request.user?.email || ''}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-zinc-400">
                      {formatSubmittedAt(request.lateRequestedAt)}
                    </td>
                    <td className="px-3 py-3 max-w-md">
                      <p className="whitespace-pre-wrap break-words text-zinc-300">
                        {request.lateReason || '—'}
                      </p>
                    </td>
                    {!readOnly ? (
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              approveMutation.mutate({
                                id: request._id,
                                decision: 'present',
                              })
                            }
                            className={ADMIN_BTN_PRIMARY}
                          >
                            Approve &amp; Mark Present
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              approveMutation.mutate({
                                id: request._id,
                                decision: 'late',
                              })
                            }
                            className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 font-display text-sm font-semibold text-white shadow-lg shadow-amber-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Approve &amp; Mark Late
                          </button>
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
