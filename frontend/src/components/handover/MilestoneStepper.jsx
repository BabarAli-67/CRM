import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMilestone } from '../../services/handover.service.js';

/** Visual steps — API `assigned` displays as Pending. */
const STEPS = [
  { key: 'assigned', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'ongoing_seo', label: 'Ongoing (SEO)' },
  { key: 'completed', label: 'Completed' },
];

const NEXT_OPTIONS = {
  assigned: [{ value: 'in_progress', label: 'Start → In Progress' }],
  in_progress: [
    { value: 'ongoing_seo', label: 'Mark → Ongoing (SEO)' },
    { value: 'completed', label: 'Mark → Completed' },
  ],
  // SEO Experts (and other non-Developer roles) can Start work after handoff
  ongoing_seo: [
    { value: 'in_progress', label: 'Start → In Progress' },
    { value: 'completed', label: 'Mark → Completed' },
  ],
};

/** Developers may only hand off to Ongoing (SEO) — never Mark Completed. */
const DEVELOPER_NEXT_OPTIONS = {
  assigned: [{ value: 'in_progress', label: 'Start → In Progress' }],
  in_progress: [
    { value: 'ongoing_seo', label: 'Move to Ongoing (SEO)' },
  ],
  ongoing_seo: [],
};

/**
 * Forward-only milestone stepper for tech-assigned projects.
 *
 * @param {string} leadId
 * @param {string} [status] Current handover.cstStatus / techStatus
 * @param {boolean} [developerHandoffOnly] Hide Mark Completed; SEO handoff only
 * @param {boolean} [actionsDisabled] Lock all next-step buttons (SEO waiting gate)
 * @param {string} [disabledNote] Subtle note shown when locked
 * @param {(lead: object) => void} [onUpdated]
 */
export default function MilestoneStepper({
  leadId,
  status = 'assigned',
  developerHandoffOnly = false,
  actionsDisabled = false,
  disabledNote = '',
  onUpdated,
}) {
  const queryClient = useQueryClient();

  const current =
    status === 'assigned_to_tech' ? 'assigned' : status || 'assigned';

  const currentIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.key === current)
  );
  const optionMap = developerHandoffOnly
    ? DEVELOPER_NEXT_OPTIONS
    : NEXT_OPTIONS;
  const nextOptions = optionMap[current] || [];
  const isComplete = current === 'completed';
  // When on Ongoing (SEO), treat that step as reached even if we skipped visually
  // from In Progress; Completed still shows as last.
  const displayIndex =
    current === 'ongoing_seo'
      ? STEPS.findIndex((s) => s.key === 'ongoing_seo')
      : currentIndex;

  const mutation = useMutation({
    mutationFn: (milestone) => updateMilestone(leadId, milestone),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myCompletedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myPriorityProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myTaskStats'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadPriority'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      onUpdated?.(lead);
    },
  });

  return (
    <div className="space-y-3">
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((step, index) => {
          const done =
            index < displayIndex || (isComplete && index < STEPS.length - 1);
          const active = index === displayIndex && !isComplete;
          const reached = index <= displayIndex || isComplete;

          return (
            <li key={step.key} className="flex items-center gap-2">
              {index > 0 ? (
                <span
                  className={[
                    'hidden h-px w-6 sm:block',
                    reached ? 'bg-orange-500/70' : 'bg-zinc-700',
                  ].join(' ')}
                  aria-hidden
                />
              ) : null}
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                  done || (isComplete && index === displayIndex)
                    ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                    : active
                      ? 'bg-orange-600/20 text-orange-200 ring-orange-500/40'
                      : 'bg-zinc-800/60 text-zinc-500 ring-zinc-700/60',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                    done || isComplete
                      ? 'bg-emerald-500/30 text-emerald-200'
                      : active
                        ? 'bg-orange-600 text-white'
                        : 'bg-zinc-700 text-zinc-400',
                  ].join(' ')}
                >
                  {done || isComplete ? '✓' : index + 1}
                </span>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {!isComplete ? (
          nextOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={mutation.isPending || actionsDisabled}
              title={actionsDisabled ? disabledNote || undefined : undefined}
              onClick={() => {
                if (actionsDisabled) return;
                mutation.mutate(opt.value);
              }}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? 'Updating…' : opt.label}
            </button>
          ))
        ) : (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/35">
            Completed
          </span>
        )}

        {actionsDisabled && disabledNote ? (
          <p className="w-full text-xs text-amber-400/90">{disabledNote}</p>
        ) : null}

        {mutation.isError ? (
          <p role="alert" className="text-xs text-red-300">
            {mutation.error?.response?.data?.message ||
              'Failed to update milestone.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
