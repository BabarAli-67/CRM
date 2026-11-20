import Callback from '../models/callback.model.js';
import { buildAlertFlagsForSchedule } from './alertTiming.util.js';

/** Statuses that still appear on an agent's active agenda / reminders. */
export const ACTIVE_CALLBACK_STATUSES = ['pending', 'attended'];

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
 * Hand pending/attended lead-linked callbacks to the assigned closer.
 * Keeps status pending, sets closerId, re-arms PKT alert flags when due time
 * is still upcoming so the closer gets the exact-time ring.
 *
 * @param {import('mongoose').Types.ObjectId|string} leadId
 * @param {import('mongoose').Types.ObjectId|string} closerId
 */
export async function transferPendingCallbacksToCloser(leadId, closerId) {
  if (!leadId || !closerId) return { modifiedCount: 0 };

  const open = await Callback.find({
    leadId,
    status: { $in: ACTIVE_CALLBACK_STATUSES },
  });

  if (!open.length) return { modifiedCount: 0 };

  let modifiedCount = 0;
  for (const cb of open) {
    cb.closerId = closerId;
    cb.assignedCloserId = closerId;
    cb.status = 'pending';
    cb.alerts = buildAlertFlagsForSchedule(cb.callbackAt);
    await cb.save();
    modifiedCount += 1;
  }

  return { modifiedCount };
}

/**
 * Heal pending callbacks whose linked lead is no longer with the agent.
 * Leads with a closer get callbacks transferred (still pending for closer alerts).
 */
export async function healStaleAgentCallbacks(agentId) {
  const pending = await Callback.find({
    agentId,
    status: 'pending',
    leadId: { $ne: null },
  })
    .populate('leadId', 'stage status agentId closerId')
    .select('_id leadId closerId assignedCloserId');

  const transferredAwayIds = [];
  const cancelledIds = [];
  let handedToCloser = 0;

  for (const cb of pending) {
    const lead = cb.leadId;
    if (!lead) continue;

    if (lead.stage === 'disqualified') {
      cancelledIds.push(cb._id);
      continue;
    }

    if (lead.stage === 'closed_sale') {
      transferredAwayIds.push(cb._id);
      continue;
    }

    // Active but no longer with this agent → hand to closer when possible
    if (
      lead.stage === 'active' &&
      (lead.status !== 'with_agent' ||
        String(lead.agentId) !== String(agentId))
    ) {
      if (lead.closerId) {
        await transferPendingCallbacksToCloser(lead._id, lead.closerId);
        handedToCloser += 1;
      } else {
        transferredAwayIds.push(cb._id);
      }
    }
  }

  const silence = {
    'alerts.fiveMinFired': true,
    'alerts.exactTimeFired': true,
  };

  if (transferredAwayIds.length) {
    await Callback.updateMany(
      { _id: { $in: transferredAwayIds } },
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
    transferred: transferredAwayIds.length,
    cancelled: cancelledIds.length,
    handedToCloser,
  };
}
