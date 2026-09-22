import Callback from '../models/callback.model.js';

/** Statuses that still appear on an agent's active agenda / reminders. */
export const ACTIVE_CALLBACK_STATUSES = ['pending'];

/**
 * Resolve all open callbacks for a lead so agents stop seeing reminders.
 * @param {import('mongoose').Types.ObjectId|string} leadId
 * @param {'completed'|'transferred'|'cancelled'} resolution
 */
export async function resolveCallbacksForLead(leadId, resolution) {
  if (!leadId) return { modifiedCount: 0 };

  const allowed = ['completed', 'transferred', 'cancelled'];
  if (!allowed.includes(resolution)) {
    throw new Error(`Invalid callback resolution: ${resolution}`);
  }

  const result = await Callback.updateMany(
    {
      leadId,
      status: { $in: ACTIVE_CALLBACK_STATUSES },
    },
    {
      $set: {
        status: resolution,
        'alerts.fiveMinFired': true,
        'alerts.exactTimeFired': true,
      },
    }
  );

  return { modifiedCount: result.modifiedCount || 0 };
}

/**
 * Heal pending callbacks whose linked lead is no longer with the agent.
 * Used as a safety net for records created before auto-resolve existed.
 */
export async function healStaleAgentCallbacks(agentId) {
  const pending = await Callback.find({
    agentId,
    status: 'pending',
    leadId: { $ne: null },
  })
    .populate('leadId', 'stage status agentId')
    .select('_id leadId');

  const transferredIds = [];
  const cancelledIds = [];

  for (const cb of pending) {
    const lead = cb.leadId;
    if (!lead) continue;

    if (lead.stage === 'disqualified') {
      cancelledIds.push(cb._id);
      continue;
    }

    if (lead.stage === 'closed_sale') {
      transferredIds.push(cb._id);
      continue;
    }

    // Active but no longer with this agent (pool / claimed by closer)
    if (
      lead.stage === 'active' &&
      (lead.status !== 'with_agent' ||
        String(lead.agentId) !== String(agentId))
    ) {
      transferredIds.push(cb._id);
    }
  }

  const silence = {
    'alerts.fiveMinFired': true,
    'alerts.exactTimeFired': true,
  };

  if (transferredIds.length) {
    await Callback.updateMany(
      { _id: { $in: transferredIds } },
      { $set: { status: 'transferred', ...silence } }
    );
  }
  if (cancelledIds.length) {
    await Callback.updateMany(
      { _id: { $in: cancelledIds } },
      { $set: { status: 'cancelled', ...silence } }
    );
  }

  return {
    transferred: transferredIds.length,
    cancelled: cancelledIds.length,
  };
}
