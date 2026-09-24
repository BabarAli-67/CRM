import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { promoteCallback } from '../../services/callback.service.js';

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Phase 4.3 LeadForm edit route — opened with the promoted lead id */
export const leadEditPath = (leadId) =>
  `/dashboard/sales-agent/leads/${leadId}/edit`;

export default function CallbackTable({ callbacks = [], onEdit = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [promoteError, setPromoteError] = useState('');

  const promoteMutation = useMutation({
    mutationFn: (callbackId) => promoteCallback(callbackId),
    onSuccess: (lead) => {
      setPromoteError('');
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      if (lead?._id) {
        navigate(leadEditPath(lead._id));
      }
    },
    onError: (err) => {
      setPromoteError(
        err?.response?.data?.message || 'Failed to promote callback to lead.'
      );
    },
  });

  const rows = useMemo(
    () =>
      [...callbacks].sort(
        (a, b) => new Date(a.callbackAt) - new Date(b.callbackAt)
      ),
    [callbacks]
  );

  const now = Date.now();
  const promotingId = promoteMutation.isPending
    ? promoteMutation.variables
    : null;

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        No upcoming callbacks. Use + Add Callback or schedule from My Leads.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {promoteError ? (
        <p role="alert" className="text-sm text-red-300">
          {promoteError}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-zinc-200">
          <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 font-medium">Business</th>
              <th className="px-3 py-2.5 font-medium">Phone</th>
              <th className="px-3 py-2.5 font-medium">Callback (PKT)</th>
              <th className="px-3 py-2.5 font-medium">Notes</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const at = new Date(row.callbackAt).getTime();
              const isPending = row.status === 'pending';
              const isAttended =
                row.status === 'attended' || row.status === 'completed';
              const overdue =
                isPending && !Number.isNaN(at) && at < now;
              const isPromoting = promotingId === row._id;
              const linkedLeadId = row.leadId?._id || row.leadId || null;
              const canEdit =
                isPending && typeof onEdit === 'function';

              const statusBadge = (() => {
                if (row.status === 'promoted') {
                  return {
                    label: 'Promoted',
                    className:
                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  };
                }
                if (isAttended) {
                  return {
                    label: 'Attended',
                    className:
                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  };
                }
                if (overdue) {
                  return {
                    label: 'Overdue',
                    className:
                      'bg-orange-500/10 text-orange-400 border-orange-500/20',
                  };
                }
                return {
                  label: 'Pending',
                  className:
                    'bg-amber-500/10 text-amber-400 border-amber-500/20',
                };
              })();

              return (
                <tr
                  key={row._id}
                  data-reminder-row={`callback-${row._id}`}
                  className={[
                    'border-b border-zinc-800/60 last:border-0 transition-colors hover:bg-zinc-800/30',
                    overdue ? 'bg-orange-600/10' : '',
                  ].join(' ')}
                >
                  <td className="px-3 py-2.5 font-medium">
                    {row.businessName}
                    {overdue ? (
                      <span className="ml-2 inline-flex rounded-full border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                        Overdue
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{row.phone}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatPkt(row.callbackAt)}
                  </td>
                  <td className="px-3 py-2.5 max-w-[12rem] truncate text-zinc-400">
                    {row.notes || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={[
                        'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        statusBadge.className,
                      ].join(' ')}
                    >
                      {statusBadge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="cursor-pointer rounded-full border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
                        >
                          Edit
                        </button>
                      ) : null}
                      {linkedLeadId ? (
                        <button
                          type="button"
                          onClick={() => navigate(leadEditPath(linkedLeadId))}
                          className="cursor-pointer rounded-full border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
                        >
                          Open Lead
                        </button>
                      ) : row.status === 'promoted' ? null : (
                        <button
                          type="button"
                          disabled={isPromoting}
                          onClick={() => {
                            setPromoteError('');
                            promoteMutation.mutate(row._id);
                          }}
                          className="cursor-pointer rounded-full bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-60"
                        >
                          {isPromoting ? 'Promoting…' : 'Promote to Lead'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
