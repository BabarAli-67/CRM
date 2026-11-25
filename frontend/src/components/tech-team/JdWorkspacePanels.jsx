/**
 * Role-specific Tech workspace panels (non-SEO).
 */

export function DeveloperMockupPanel() {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-6 py-10 shadow-xl">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Developer · Mockup
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold text-white">
        Mockup Workspace
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Mockup Workspace — Ready for staging links, design previews, and build
        submissions
      </p>
      <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-[#0A0A0A]/60 px-5 py-10 text-center">
        <p className="text-sm text-zinc-500">
          Structured mockup tools will land here next. Comments stay available
          for CST ↔ Tech coordination.
        </p>
      </div>
    </section>
  );
}

export function RoleDeliverableWorkspace({
  badge,
  title,
  hint,
  taskNotes = [],
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-6 py-5 shadow-xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {badge}
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">{hint}</p>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-5">
        <h3 className="text-sm font-semibold text-white">
          Role-Specific Task / Deliverable Notes
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Notes forwarded by Tech Head appear below. Use Comments for live
          discussion.
        </p>

        {Array.isArray(taskNotes) && taskNotes.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {taskNotes.map((note) => (
              <li
                key={note.noteId}
                className="rounded-xl border border-orange-500/25 bg-orange-500/5 px-4 py-3"
              >
                <p className="whitespace-pre-wrap text-sm text-zinc-200">
                  {note.body}
                </p>
                {note.guidance ? (
                  <p className="mt-1.5 text-xs text-orange-200/90">
                    Guidance: {note.guidance}
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] text-zinc-500">
                  From {note.createdByName || 'Tech Head'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-[#0A0A0A]/50 px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">
              No deliverable notes yet for this specialization.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
