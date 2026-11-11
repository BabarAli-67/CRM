/**
 * Map active leads with follow-ups into useReminderScheduler items.
 * Agents only get reminders for leads still with them (with_agent).
 * Closers get reminders for leads handed to them (with_closer).
 * Excludes closed_sale / disqualified.
 */
export function buildLeadFollowUpReminders(leads, currentUserId, options = {}) {
  const { role } = options;

  return (leads || [])
    .filter((lead) => {
      if (!lead?.followUp?.callbackAt) return false;
      if (lead.followUp?.acknowledged) return false;
      if (lead.stage === 'closed_sale' || lead.stage === 'disqualified') {
        return false;
      }
      if (lead.stage !== 'active') return false;

      if (role === 'sales_agent') {
        return lead.status === 'with_agent';
      }

      if (role === 'closer') {
        return (
          (lead.status === 'with_closer' || lead.status === 'in_progress') &&
          String(lead.closerId?._id || lead.closerId || '') ===
            String(currentUserId || '')
        );
      }

      // Default: any active lead still with agent or closer
      return lead.status === 'with_agent' || lead.status === 'with_closer';
    })
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
