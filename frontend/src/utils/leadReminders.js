/**
 * Map active leads with follow-ups into useReminderScheduler items.
 * Excludes closed_sale (vanishing rule) even if a stale payload slips through.
 */
export function buildLeadFollowUpReminders(leads, currentUserId) {
  return (leads || [])
    .filter(
      (lead) => lead?.followUp?.callbackAt && lead.stage !== 'closed_sale'
    )
    .map((lead) => {
      const agentId = lead.agentId?._id || lead.agentId;
      const closerId = lead.closerId?._id || lead.closerId;
      const notifyUserIds = [agentId, closerId].filter(Boolean).map(String);
      if (currentUserId && !notifyUserIds.includes(String(currentUserId))) {
        notifyUserIds.push(String(currentUserId));
      }
      return {
        id: lead._id,
        kind: 'followup',
        triggerAt: lead.followUp.callbackAt,
        notifyUserIds,
        alerts: lead.followUp.alerts || {
          fiveMinFired: false,
          exactTimeFired: false,
        },
        businessName: lead.businessName,
        phone: lead.phone,
        item: lead,
      };
    });
}
