/** Tech Head operational status options + shared badge styling. */

export const CLIENT_OPS_OPTIONS = [
  'Running',
  'Paused',
  'Stopped / Out',
  'Pending',
];

export const GMB_OPS_OPTIONS = [
  'Verified',
  'Pending Verification',
  'Suspended',
  'Not Applicable',
];

export const WEBSITE_SEO_OPS_OPTIONS = [
  'Running',
  'In Progress',
  'Paused',
  'Completed',
  'Not Applicable',
];

const TONE = {
  green:
    'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  amber: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  red: 'bg-red-500/15 text-red-300 border-red-500/40',
  zinc: 'bg-white/5 text-[#A3A3A3] border-white/15',
};

const STATUS_TONE = {
  Running: 'green',
  Verified: 'green',
  Completed: 'green',
  Pending: 'amber',
  'Pending Verification': 'amber',
  'In Progress': 'amber',
  Paused: 'red',
  'Stopped / Out': 'red',
  Suspended: 'red',
  'Not Applicable': 'zinc',
};

export const opsStatusBadgeClass = (status) =>
  TONE[STATUS_TONE[status] || 'zinc'] || TONE.zinc;

export const resolveClientOpsStatus = (handover) => {
  if (handover?.clientOpsStatus) return handover.clientOpsStatus;
  // Default once onboarded / assigned (legacy rows before field existed)
  if (
    handover?.cstStatus &&
    handover.cstStatus !== 'awaiting_handover' &&
    handover.cstStatus !== 'pending_review'
  ) {
    return 'Running';
  }
  return null;
};
