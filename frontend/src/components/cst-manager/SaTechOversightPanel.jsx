import { CST_STATUS_LABEL } from '../../utils/formatPayment.util.js';

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const statusLabel = (lead) => {
  const key = lead?.handover?.techStatus || lead?.handover?.cstStatus;
  return CST_STATUS_LABEL[key] || key || '—';
};

/**
 * Super Admin only — tech assignments, forwarded escalations, intern activity.
 * Never rendered for CST Manager / Tech roles.
 */
export default function SaTechOversightPanel({ lead }) {
  const assignees = Array.isArray(lead?.handover?.assignedTechIds)
    ? lead.handover.assignedTechIds
    : lead?.handover?.assignedTechId
      ? [lead.handover.assignedTechId]
      : [];

  const notes = Array.isArray(lead?.handover?.techTaskNotes)
    ? [...lead.handover.techTaskNotes].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )
    : [];

  const internRows = Array.isArray(lead?.handover?.internActivity)
    ? [...lead.handover.internActivity].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-white">
          Tech Assignments
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Status: {statusLabel(lead)} · Assigned{' '}
          {formatPkt(lead?.handover?.assignedAt)}
        </p>
        <ul className="mt-3 space-y-2">
          {assignees.length === 0 ? (
            <li className="text-sm text-zinc-500">No Tech specialists assigned.</li>
          ) : (
            assignees.map((t) => {
              const id = typeof t === 'object' ? t._id : t;
              const name =
                typeof t === 'object'
                  ? t.fullName || t.username || id
                  : id;
              const jd = typeof t === 'object' ? t.jd : null;
              return (
                <li
                  key={String(id)}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200"
                >
                  {name}
                  {jd ? (
                    <span className="ml-2 text-xs text-zinc-500">{jd}</span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-white">
          Forwarded @Tech Head Escalations
        </h2>
        <div className="mt-3 space-y-2">
          {notes.length === 0 ? (
            <p className="text-sm text-zinc-500">No forwarded task notes.</p>
          ) : (
            notes.map((n) => (
              <article
                key={n.noteId}
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5"
              >
                <p className="text-xs text-zinc-500">
                  → {n.assignedToName || 'Specialist'} · from{' '}
                  {n.createdByName || 'Tech Head'} · {formatPkt(n.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
                  {n.body}
                </p>
                {n.guidance ? (
                  <p className="mt-1 text-xs text-orange-200/90">
                    Guidance: {n.guidance}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-white">
          Confidential Intern Activity
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Silent Tech Head copies — mentors never see this channel.
        </p>
        <div className="mt-3 space-y-2">
          {internRows.length === 0 ? (
            <p className="text-sm text-zinc-500">No intern activity logged.</p>
          ) : (
            internRows.map((row) => (
              <article
                key={row.activityId}
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#F25E26]">
                  [Intern Update · {row.internName || 'Intern'} · Under{' '}
                  {row.mentorName || 'Supervisor'}]
                </p>
                <p className="mt-1 text-sm text-zinc-200">{row.summary}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {row.type} · {formatPkt(row.createdAt)}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
