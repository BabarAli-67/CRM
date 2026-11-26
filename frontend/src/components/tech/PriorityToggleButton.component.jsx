import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { setClientPriority } from '../../services/techHead.service.js';

/**
 * Tech Head Mark as Priority / Remove Priority toggle.
 */
export default function PriorityToggleButton({ lead, className = '' }) {
  const queryClient = useQueryClient();
  const isPriority = Boolean(lead?.handover?.isPriority);

  const mutation = useMutation({
    mutationFn: (next) => setClientPriority(lead._id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['techHeadPriority'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadQueue'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadCompleted'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myPriorityProjects'] });
      queryClient.invalidateQueries({
        queryKey: ['techHeadClient', lead._id],
      });
    },
  });

  return (
    <button
      type="button"
      disabled={mutation.isPending || !lead?._id}
      onClick={() => mutation.mutate(!isPriority)}
      title={isPriority ? 'Remove Priority' : 'Mark as Priority'}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        isPriority
          ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-500/30'
          : 'border border-zinc-600 text-zinc-200 hover:bg-zinc-800',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Flag className="h-3.5 w-3.5" aria-hidden />
      {mutation.isPending
        ? 'Saving…'
        : isPriority
          ? 'Priority'
          : 'Mark as Priority'}
    </button>
  );
}

export function PriorityPill({ lead, className = '' }) {
  if (!lead?.handover?.isPriority) return null;
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 ring-1 ring-amber-500/35',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Flag className="h-3 w-3" aria-hidden />
      Priority
    </span>
  );
}
