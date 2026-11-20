import Lead from '../models/lead.model.js';
import { transferPendingCallbacksToCloser } from './callbackResolve.util.js';
import { buildAlertFlagsForSchedule } from './alertTiming.util.js';

/** Agent must close or hand off a lead within this window. */
export const AGENT_HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Immutable per-lead 24h clock — document createdAt only.
 * Never use updatedAt (that can be rewritten on read/save).
 */
export function agentHoldAnchor(lead) {
  const created = lead?.createdAt ? new Date(lead.createdAt).getTime() : NaN;
  if (!Number.isNaN(created)) return created;
  return Date.now();
}

export function agentHoldRemainingMs(lead, now = Date.now()) {
  return AGENT_HOLD_MS - (now - agentHoldAnchor(lead));
}

/**
 * Escalate stale with_agent leads directly to their pre-assigned closer.
 * Pending callbacks transfer to that closer (stay pending + re-armed alerts).
 * @param {import('mongoose').Types.ObjectId|string|null} [agentId]
 * @returns {Promise<{ escalated: number, ids: string[] }>}
 */
export async function escalateStaleAgentLeads(agentId = null) {
  const cutoff = new Date(Date.now() - AGENT_HOLD_MS);

  const filter = {
    stage: 'active',
    status: 'with_agent',
    closerId: { $ne: null, $exists: true },
    createdAt: { $lte: cutoff },
  };

  if (agentId) {
    filter.agentId = agentId;
  }

  const stale = await Lead.find(filter)
    .select('_id closerId followUp')
    .lean();
  if (!stale.length) {
    return { escalated: 0, ids: [] };
  }

  const now = new Date();
  const ids = [];

  for (const lead of stale) {
    const $set = {
      status: 'with_closer',
      escalatedAt: now,
      handedOverAt: now,
      escalationType: 'auto',
      escalatedReason: 'Auto Moved',
    };

    // Keep follow-up time visible; re-arm closer reminders if still scheduled
    if (lead.followUp?.callbackAt) {
      $set['followUp.acknowledged'] = false;
      $set['followUp.alerts'] = buildAlertFlagsForSchedule(
        lead.followUp.callbackAt
      );
    }

    await Lead.updateOne({ _id: lead._id }, { $set });

    try {
      await transferPendingCallbacksToCloser(lead._id, lead.closerId);
    } catch {
      // Continue — escalation already applied
    }

    ids.push(lead._id);
  }

  return { escalated: ids.length, ids: ids.map(String) };
}
