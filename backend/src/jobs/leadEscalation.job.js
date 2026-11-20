import { escalateStaleAgentLeads } from '../utils/leadEscalation.util.js';

/**
 * Periodic sweep: move expired agent leads (and linked callbacks) to closers.
 */
export default async function runLeadEscalationSweep() {
  return escalateStaleAgentLeads();
}
