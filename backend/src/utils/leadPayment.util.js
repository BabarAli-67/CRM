import { ApiError } from './apiError.util.js';

/** max(0, offered - received) */
export function computePaymentPending(offered, received) {
  const o = Math.max(0, Number(offered) || 0);
  const r = Math.max(0, Number(received) || 0);
  return Math.max(0, o - r);
}

export function parseNonNegativeAmount(value, label) {
  if (value === undefined || value === '' || value === null) {
    throw new ApiError(400, `${label} is required`);
  }
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) {
    throw new ApiError(400, `${label} must be a non-negative number`);
  }
  return n;
}

/**
 * Parse agent/closer payment triplet from a request body.
 * paymentReceived defaults to 0 when omitted; pending is always recomputed.
 */
export function parseLeadPaymentFields(body, { requireOffered = true } = {}) {
  let paymentOffered;
  if (
    body.paymentOffered === undefined ||
    body.paymentOffered === '' ||
    body.paymentOffered === null
  ) {
    if (requireOffered) {
      throw new ApiError(400, 'Payment Offered is required');
    }
    paymentOffered = undefined;
  } else {
    paymentOffered = parseNonNegativeAmount(
      body.paymentOffered,
      'Payment Offered'
    );
  }

  let paymentReceived;
  if (
    body.paymentReceived === undefined ||
    body.paymentReceived === '' ||
    body.paymentReceived === null
  ) {
    paymentReceived = requireOffered ? 0 : undefined;
  } else {
    paymentReceived = parseNonNegativeAmount(
      body.paymentReceived,
      'Payment Received'
    );
  }

  if (paymentOffered === undefined && paymentReceived === undefined) {
    return null;
  }

  const offered = paymentOffered ?? 0;
  const received = paymentReceived ?? 0;
  return {
    paymentOffered: offered,
    paymentReceived: received,
    paymentPending: computePaymentPending(offered, received),
  };
}
