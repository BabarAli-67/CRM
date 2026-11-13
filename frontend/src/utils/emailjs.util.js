import emailjs from '@emailjs/browser';

/**
 * Vite exposes only VITE_* vars. Placeholders live in frontend/.env.example.
 * Paste your EmailJS keys into frontend/.env (or .env.local).
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

/**
 * Send the onboarding welcome template via EmailJS.
 * Template params: to_email, client_name, business_name, phone, etc.
 */
export const sendOnboardingWelcomeEmail = async (params) => {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();

  if (!serviceId || !templateId || !publicKey) {
    throw new Error(
      'EmailJS is not configured. Set VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY in frontend/.env'
    );
  }

  return emailjs.send(serviceId, templateId, params, { publicKey });
};
