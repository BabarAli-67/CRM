import emailjs from '@emailjs/browser';

/**
 * Vite exposes only VITE_* vars. Paste keys into frontend/.env (or .env.local):
 * VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
 */
export const getEmailJsConfig = () => ({
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID || '',
  templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '',
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '',
});

export const isEmailJsConfigured = () => {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();
  return Boolean(serviceId && templateId && publicKey);
};

/** Professional welcome message template for the CST Welcome Email modal. */
export const buildWelcomeEmailTemplate = ({
  clientName,
  businessName,
} = {}) => {
  const name = String(clientName || '').trim() || 'there';
  const business = String(businessName || '').trim() || 'your business';
  return (
    `Hi ${name},\n\n` +
    `Welcome to Flash! We're excited to partner with ${business} and help you grow.\n\n` +
    `Your Client Success Manager will be in touch shortly with next steps for onboarding. ` +
    `If you have any questions in the meantime, simply reply to this email — we're here to help.\n\n` +
    `Warm regards,\n` +
    `The Flash Team`
  );
};

/**
 * Hybrid EmailJS send for CST Welcome Email.
 * Passes only the standard template vars so one EmailJS template can use
 * {{message}} in the body and {{to_email}} in To Email.
 * Extra keys (if any) are ignored — only these four are sent:
 *   to_email, client_name, business_name, message
 *
 * Throws if configured and the send fails; returns { skipped: true } when keys
 * are missing (caller still marks Sent in MongoDB).
 */
export const sendOnboardingWelcomeEmail = async ({
  to_email = '',
  client_name = '',
  business_name = '',
  message = '',
} = {}) => {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();

  if (!serviceId || !templateId || !publicKey) {
    return { skipped: true, reason: 'EmailJS not configured' };
  }

  const templateParams = {
    to_email: String(to_email || '').trim(),
    client_name: String(client_name || '').trim(),
    business_name: String(business_name || '').trim(),
    message: String(message || '').trim(),
  };

  const result = await emailjs.send(serviceId, templateId, templateParams, {
    publicKey,
  });
  return { skipped: false, result, templateParams };
};

/** closedAt + exactly 30 days (preserves PKT wall-clock; PKT has no DST). */
export const retentionAlertAtFromClosedAt = (closedAt) => {
  if (!closedAt) return null;
  const closed = new Date(closedAt);
  if (Number.isNaN(closed.getTime())) return null;
  return new Date(closed.getTime() + 30 * 24 * 60 * 60 * 1000);
};
