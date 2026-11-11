import Lead from '../models/lead.model.js';
import { resolveCallbacksForLead } from './callbackResolve.util.js';

/** Agent must close or hand off a lead within this window. */
export const AGENT_HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Immutable per-lead 24h clock — document createdAt only.
 * Never use lastAgentActivityAt / updatedAt (those can be rewritten on read/save).
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
 * Compares each lead's own createdAt against the 24h cutoff — read paths never
 * mutate timestamps; this write only touches expired docs' status metadata.
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

  const stale = await Lead.find(filter).select('_id').lean();
  if (!stale.length) {
    return { escalated: 0, ids: [] };
  }

  const ids = stale.map((l) => l._id);
  const now = new Date();

  await Lead.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        status: 'with_closer',
        escalatedAt: now,
        escalationType: 'auto',
        escalatedReason: 'Auto Moved',
        'followUp.alerts.fiveMinFired': true,
        'followUp.alerts.exactTimeFired': true,
      },
    }
  );

  for (const id of ids) {
    try {
      await resolveCallbacksForLead(id, 'transferred');
    } catch {
      // Continue — escalation already applied
    }
  }

  return { escalated: ids.length, ids: ids.map(String) };
}
