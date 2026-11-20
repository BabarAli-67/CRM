import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setWelcomeEmail } from '../../services/handover.service.js';
import {
  buildWelcomeEmailTemplate,
  isEmailJsConfigured,
  sendOnboardingWelcomeEmail,
} from '../../utils/emailjs.util.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fieldClass =
  'w-full rounded-lg border border-white/15 bg-[#0A0A0A] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

/**
 * Pending Review → Welcome Email modal (EmailJS-ready).
 * Marks welcomeEmail.sent on the lead even when EmailJS keys are not configured yet.
 */
export default function WelcomeEmailModal({ open, lead, onClose }) {
  const queryClient = useQueryClient();
  const [toEmail, setToEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !lead) return;
    setError('');
    setToEmail(
      String(lead.personalEmail || lead.businessEmail || '').trim()
    );
    setMessage(
      buildWelcomeEmailTemplate({
        clientName: lead.clientName,
        businessName: lead.businessName,
      })
    );
  }, [open, lead]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const email = toEmail.trim();
      if (!EMAIL_RE.test(email)) {
        throw new Error('Enter a valid recipient email address.');
      }

      // Hybrid EmailJS: CRM owns the full editable body in `message`
      const sendResult = await sendOnboardingWelcomeEmail({
        to_email: email,
        client_name: lead?.clientName?.trim() || '',
        business_name: lead?.businessName?.trim() || '',
        message: message.trim(),
      });

      const updated = await setWelcomeEmail(lead._id, {
        sent: true,
        toEmail: email,
      });

      return { updated, sendResult };
    },
    onSuccess: ({ updated }) => {
      queryClient.setQueryData(['handoverQueue'], (old) => {
        if (!Array.isArray(old) || !updated?._id) return old;
        return old.map((l) =>
          String(l._id) === String(updated._id) ? { ...l, ...updated } : l
        );
      });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead._id] });
      onClose?.({ sent: true, lead: updated });
    },
    onError: (err) => {
      const apiMsg = err?.response?.data?.message;
      const emailJsMsg =
        typeof err?.text === 'string'
          ? err.text
          : typeof err?.message === 'string'
            ? err.message
            : null;
      setError(
        apiMsg ||
          emailJsMsg ||
          'Failed to send welcome email. Please try again.'
      );
    },
  });

  if (!open || !lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-6">
      <button
        type="button"
        aria-label="Close welcome email backdrop"
        className="absolute inset-0 cursor-default"
        onClick={() => onClose?.({ sent: false })}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-email-title"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-[#222222] bg-[#111111] shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-[#222222] px-5 py-4">
          <div>
            <h2
              id="welcome-email-title"
              className="font-display text-lg font-semibold text-white"
            >
              Welcome Email
            </h2>
            <p className="mt-0.5 text-xs text-[#A3A3A3]">
              {lead.businessName || 'Client'}
              {!isEmailJsConfigured()
                ? ' · EmailJS keys not set — will mark Sent locally'
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.({ sent: false })}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm text-[#A3A3A3] transition hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form
          className="space-y-4 px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            sendMutation.mutate();
          }}
          noValidate
        >
          <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
            <span className="font-medium text-white">Recipient Email</span>
            <input
              type="email"
              required
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className={fieldClass}
              placeholder="client@email.com"
              autoComplete="email"
            />
          </label>

          <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
            <span className="font-medium text-white">Welcome Email Message</span>
            <textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={`${fieldClass} resize-y`}
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-[#F25E26]">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[#222222] pt-4">
            <button
              type="button"
              onClick={() => onClose?.({ sent: false })}
              disabled={sendMutation.isPending}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sendMutation.isPending}
              className="rounded-xl bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#F25E26]/25 transition hover:bg-[#ff6a33] disabled:opacity-60"
            >
              {sendMutation.isPending ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
