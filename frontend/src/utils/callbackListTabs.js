/**
 * Shared tab buckets for Agent + Closer personal callback lists.
 * Completed and Attended are independent finished statuses.
 */

export const CALLBACK_LIST_TABS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
  { id: 'attended', label: 'Attended' },
];

/**
 * @param {object} row
 * @param {number} [now]
 * @returns {'upcoming' | 'overdue' | 'completed' | 'attended' | null}
 */
export function getCallbackListBucket(row, now = Date.now()) {
  const status = row?.status;
  if (status === 'completed') return 'completed';
  if (status === 'attended') return 'attended';

  // Other terminal statuses (promoted / cancelled / transferred) are All-only
  if (
    status === 'promoted' ||
    status === 'cancelled' ||
    status === 'transferred'
  ) {
    return null;
  }

  const at = new Date(row?.callbackAt).getTime();
  if (Number.isNaN(at)) return 'upcoming';
  if (at < now) return 'overdue';
  return 'upcoming';
}

export function countCallbacksByTab(callbacks = [], now = Date.now()) {
  const counts = {
    all: 0,
    upcoming: 0,
    overdue: 0,
    completed: 0,
    attended: 0,
  };
  for (const row of callbacks) {
    counts.all += 1;
    const bucket = getCallbackListBucket(row, now);
    if (bucket && counts[bucket] != null) {
      counts[bucket] += 1;
    }
  }
  return counts;
}

export function filterCallbacksByTab(callbacks = [], tabId, now = Date.now()) {
  if (!tabId || tabId === 'all') return callbacks;
  return callbacks.filter((row) => getCallbackListBucket(row, now) === tabId);
}

/** Prefer Upcoming when it has items; otherwise All. */
export function defaultCallbackListTab(counts) {
  if (counts?.upcoming > 0) return 'upcoming';
  return 'all';
}
