import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

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

/** Promote opens New Lead form pre-filled from this callback (review before save). */
export const promoteLeadPath = '/dashboard/sales-agent/leads/new';

export default function CallbackTable({
  callbacks = [],
  onEdit = null,
  emptyMessage = 'No upcoming callbacks. Use + Add Callback or schedule from My Leads.',
}) {
  const navigate = useNavigate();

  const rows = useMemo(
    () =>
      [...callbacks].sort(
        (a, b) => new Date(a.callbackAt) - new Date(b.callbackAt)
      ),
    [callbacks]
  );

  const now = Date.now();

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm text-zinc-200">
        <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2.5 font-medium">Business</th>
            <th className="px-3 py-2.5 font-medium">Personal Phone</th>
            <th className="px-3 py-2.5 font-medium">Business Phone</th>
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
            const overdue = isPending && !Number.isNaN(at) && at < now;
            const canEdit =
              typeof onEdit === 'function' &&
              (isPending || isAttended) &&
              row.status !== 'promoted';
            const canPromote = row.status !== 'promoted';

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
                className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
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
                <td className="whitespace-nowrap px-3 py-2.5 text-zinc-300">
                  {row.personalPhone || '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-zinc-300">
                  {row.businessPhone || '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {formatPkt(row.callbackAt)}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2.5 text-zinc-400">
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
                    {canPromote ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(promoteLeadPath, {
                            state: { fromCallback: row },
                          })
                        }
                        className="cursor-pointer rounded-full bg-[#F25E26] px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[#F25E26]/20 hover:bg-[#ff6a33]"
                      >
                        Promote to Lead
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
