import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveAttendance,
  getLateQueue,
} from '../services/attendance.service.js';

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
    <div className="space-y-4 rounded-card border border-obsidian-border bg-obsidian-surface p-4 sm:p-6">
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
        <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-400">
          {error?.response?.data?.message || 'Failed to load late requests.'}
        </p>
      ) : requests.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          No pending late attendance requests.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-ink">
            <thead className="border-b border-obsidian-border text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Submitted At</th>
                <th className="px-3 py-2 font-medium">Reason Note</th>
                {!readOnly ? (
                  <th className="px-3 py-2 font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const busy =
                  approveMutation.isPending &&
                  approveMutation.variables?.id === request._id;

                return (
                  <tr
                    key={request._id}
                    className="border-b border-obsidian-border/60 last:border-0 align-top"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-medium">
                        {request.user?.fullName || '—'}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {request.user?.email || ''}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {formatSubmittedAt(request.lateRequestedAt)}
                    </td>
                    <td className="px-3 py-2.5 max-w-md">
                      <p className="whitespace-pre-wrap break-words text-ink">
                        {request.lateReason || '—'}
                      </p>
                    </td>
                    {!readOnly ? (
                      <td className="px-3 py-2.5">
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
                            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
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
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
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
