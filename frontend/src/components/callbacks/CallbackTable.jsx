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

export default function CallbackTable({ callbacks = [] }) {
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
        // Hand off to Phase 4.3 LeadForm in edit mode (pre-filled from promote)
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
      <p className="py-10 text-center text-sm text-ink/60">
        No upcoming callbacks. Create one to get started.
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
        <table className="min-w-full text-left text-sm text-ink">
          <thead className="border-b border-white/10 text-ink/70">
            <tr>
              <th className="px-3 py-2 font-medium">Business</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Link</th>
              <th className="px-3 py-2 font-medium">Callback (PKT)</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const at = new Date(row.callbackAt).getTime();
              const overdue =
                !Number.isNaN(at) && at < now && row.status !== 'promoted';
              const isPromoting = promotingId === row._id;

              return (
                <tr
                  key={row._id}
                  data-reminder-row={`callback-${row._id}`}
                  className={[
                    'border-b border-white/5 last:border-0 transition',
                    overdue ? 'bg-flash-primary/10' : '',
                  ].join(' ')}
                >
                  <td className="px-3 py-2.5 font-medium">
                    {row.businessName}
                    {overdue ? (
                      <span className="ml-2 inline-flex rounded-md bg-flash-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-flash-secondary">
                        Overdue
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{row.phone}</td>
                  <td className="px-3 py-2.5 max-w-[10rem] truncate">
                    <a
                      href={row.businessLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-flash-secondary hover:underline"
                    >
                      {row.businessLink}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatPkt(row.callbackAt)}
                  </td>
                  <td className="px-3 py-2.5 max-w-[12rem] truncate text-ink/70">
                    {row.notes || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={[
                        'inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                        row.status === 'promoted'
                          ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
                      ].join(' ')}
                    >
                      {row.status === 'promoted' ? 'Promoted' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.status === 'promoted' ? (
                      <span className="text-xs text-ink/50">—</span>
                    ) : (
                      <button
                        type="button"
                        disabled={isPromoting}
                        onClick={() => {
                          setPromoteError('');
                          promoteMutation.mutate(row._id);
                        }}
                        className="rounded-md bg-flash-tertiary/90 px-2.5 py-1.5 text-xs font-semibold text-obsidian hover:bg-flash-tertiary disabled:opacity-60"
                      >
                        {isPromoting ? 'Promoting…' : 'Promote to Lead'}
                      </button>
                    )}
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
