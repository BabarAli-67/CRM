/**
 * Map a Callback document into LeadForm initialValues for Promote → review.
 * Closer must come from assignedCloserId (populated or raw ObjectId).
 * Pass `closerIdOverride` for closer Direct Contact → Lead (logged-in closer).
 */
export function leadPrefillFromCallback(callback, { closerIdOverride } = {}) {
  if (!callback) return null;

  const closerRef = callback.assignedCloserId || callback.closerId;
  const closerId =
    closerIdOverride != null && closerIdOverride !== ''
      ? String(closerIdOverride)
      : closerRef?._id
        ? String(closerRef._id)
        : closerRef
          ? String(closerRef)
          : '';

  return {
    businessName: callback.businessName || '',
    personalPhone: callback.personalPhone || '',
    businessPhone: callback.businessPhone || '',
    websiteLink: callback.businessLink || '',
    notes: callback.notes || '',
    closerId,
    clientName: '',
    businessEmail: '',
    personalEmail: '',
    gmbLink: '',
    serviceAreas: '',
    servicesOffered: '',
    paymentOffered: '',
    paymentReceived: '0',
    paymentPending: '',
    sourceCallbackId: callback._id ? String(callback._id) : null,
  };
}
