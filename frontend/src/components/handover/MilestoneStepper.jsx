import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMilestone } from '../../services/handover.service.js';

/** Visual steps — API uses `assigned`; UI label matches product wording. */
const STEPS = [
  { key: 'assigned', label: 'Assigned to Tech' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

const NEXT_OF = {
  assigned: 'in_progress',
  in_progress: 'completed',
};

/**
 * Forward-only milestone stepper for tech-assigned projects.
 *
 * @param {string} leadId
 * @param {string} [status] Current handover.cstStatus
 * @param {(lead: object) => void} [onUpdated]
 */
export default function MilestoneStepper({
  leadId,
  status = 'assigned',
  onUpdated,
}) {
  const queryClient = useQueryClient();

  // Backend stores `assigned`; product label is "Assigned to Tech"
  const current =
    status === 'assigned_to_tech' ? 'assigned' : status || 'assigned';

  const currentIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.key === current)
  );
  const nextMilestone = NEXT_OF[current];
  const isComplete = current === 'completed';

  const mutation = useMutation({
    mutationFn: (milestone) => updateMilestone(leadId, milestone),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      onUpdated?.(lead);
    },
  });

  return (
    <div className="space-y-3">
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((step, index) => {
          const done = index < currentIndex || isComplete;
          const active = index === currentIndex && !isComplete;
          const reached = index <= currentIndex;

          return (
            <li key={step.key} className="flex items-center gap-2">
              {index > 0 ? (
                <span
                  className={[
                    'hidden h-px w-6 sm:block',
                    reached ? 'bg-flash-secondary/70' : 'bg-white/15',
                  ].join(' ')}
                  aria-hidden
                />
              ) : null}
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                  done || (isComplete && index === currentIndex)
                    ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                    : active
                      ? 'bg-flash-primary/20 text-flash-secondary ring-flash-primary/40'
                      : 'bg-white/5 text-ink/45 ring-white/10',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                    done || isComplete
                      ? 'bg-emerald-500/30 text-emerald-200'
                      : active
                        ? 'bg-flash-primary text-white'
                        : 'bg-white/10 text-ink/50',
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
          <button
            type="button"
            disabled={mutation.isPending || !nextMilestone}
            onClick={() => mutation.mutate(nextMilestone)}
            className="rounded-md bg-flash-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-flash-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending
              ? 'Updating…'
              : nextMilestone === 'in_progress'
                ? 'Next → In Progress'
                : 'Next → Completed'}
          </button>
        ) : (
          <span className="text-xs font-medium text-emerald-300/90">
            Project completed
          </span>
        )}

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
