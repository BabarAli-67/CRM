/** Early warning lead time for callback / follow-up reminders. */
export const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Initial alert flags for a newly scheduled (or rescheduled) callback time.
 * If fewer than 5 minutes remain until `callbackAt`, skip the early warning
 * by marking fiveMinFired — otherwise it would ring immediately on save.
 * The exact-time alert stays armed either way.
 *
 * @param {Date|string|number} callbackAt
 * @param {number} [now]
 * @returns {{ fiveMinFired: boolean, exactTimeFired: boolean }}
 */
export function buildAlertFlagsForSchedule(callbackAt, now = Date.now()) {
  const triggerMs = new Date(callbackAt).getTime();
  if (Number.isNaN(triggerMs)) {
    return { fiveMinFired: false, exactTimeFired: false };
  }

  const remainingMs = triggerMs - now;
  return {
    fiveMinFired: remainingMs < FIVE_MIN_MS,
    exactTimeFired: false,
  };
}
