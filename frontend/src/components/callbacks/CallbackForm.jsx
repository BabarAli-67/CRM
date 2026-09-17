import { useEffect, useState } from 'react';

const emptyForm = {
  businessName: '',
  phone: '',
  businessLink: '',
  callbackAt: '',
  notes: '',
};

/** datetime-local value in local time from a Date / ISO string */
const toLocalInputValue = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CallbackForm({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  initialValues = null,
  title = 'New Callback',
}) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (initialValues) {
      setForm({
        businessName: initialValues.businessName || '',
        phone: initialValues.phone || '',
        businessLink: initialValues.businessLink || '',
        callbackAt: toLocalInputValue(initialValues.callbackAt),
        notes: initialValues.notes || '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, initialValues]);

  if (!open) return null;

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (
      !form.businessName.trim() ||
      !form.phone.trim() ||
      !form.businessLink.trim() ||
      !form.callbackAt
    ) {
      setError('Business name, phone, business link, and callback time are required.');
      return;
    }

    const callbackAt = new Date(form.callbackAt);
    if (Number.isNaN(callbackAt.getTime())) {
      setError('Please provide a valid callback date and time.');
      return;
    }

    try {
      await onSubmit({
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        businessLink: form.businessLink.trim(),
        callbackAt: callbackAt.toISOString(),
        notes: form.notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Failed to save callback. Please try again.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/70 p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close form backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="callback-form-title"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-obsidian-elevated shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2
            id="callback-form-title"
            className="font-display text-lg font-semibold text-ink"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-ink/70 hover:bg-white/10 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <label className="block space-y-1.5 text-sm text-ink/80">
            <span>Business name</span>
            <input
              required
              value={form.businessName}
              onChange={handleChange('businessName')}
              className="w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-ink outline-none focus:border-flash-secondary"
            />
          </label>

          <label className="block space-y-1.5 text-sm text-ink/80">
            <span>Phone</span>
            <input
              required
              value={form.phone}
              onChange={handleChange('phone')}
              className="w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-ink outline-none focus:border-flash-secondary"
            />
          </label>

          <label className="block space-y-1.5 text-sm text-ink/80">
            <span>Business link</span>
            <input
              required
              type="url"
              placeholder="https://"
              value={form.businessLink}
              onChange={handleChange('businessLink')}
              className="w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-ink outline-none focus:border-flash-secondary"
            />
          </label>

          <label className="block space-y-1.5 text-sm text-ink/80">
            <span>Callback at</span>
            <input
              required
              type="datetime-local"
              value={form.callbackAt}
              onChange={handleChange('callbackAt')}
              className="w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-ink outline-none focus:border-flash-secondary"
            />
          </label>

          <label className="block space-y-1.5 text-sm text-ink/80">
            <span>Notes (optional)</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={handleChange('notes')}
              className="w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-ink outline-none focus:border-flash-secondary"
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-ink/80 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-flash-primary px-4 py-2 text-sm font-semibold text-white hover:bg-flash-secondary disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Save Callback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
