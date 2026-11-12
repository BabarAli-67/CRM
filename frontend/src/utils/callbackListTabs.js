/**
 * Shared tab buckets for Agent + Closer personal callback lists.
 * Upcoming includes due-soon; Completed / Attended covers finished statuses.
 */

export const CALLBACK_LIST_TABS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'done', label: 'Completed / Attended' },
];

const DONE_STATUSES = new Set([
  'attended',
  'completed',
  'promoted',
  'cancelled',
  'transferred',
]);

/**
 * @param {object} row
 * @param {number} [now]
 * @returns {'upcoming' | 'overdue' | 'done'}
 */
export function getCallbackListBucket(row, now = Date.now()) {
  if (DONE_STATUSES.has(row?.status)) {
    return 'done';
  }

  const at = new Date(row?.callbackAt).getTime();
  if (Number.isNaN(at)) return 'upcoming';
  if (at < now) return 'overdue';
  return 'upcoming';
}

export function countCallbacksByTab(callbacks = [], now = Date.now()) {
  const counts = { all: 0, upcoming: 0, overdue: 0, done: 0 };
  for (const row of callbacks) {
    counts.all += 1;
    counts[getCallbackListBucket(row, now)] += 1;
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
