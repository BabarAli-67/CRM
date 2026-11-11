import { useEffect, useMemo, useState } from 'react';

const pillActive =
  'bg-orange-600 text-white shadow-lg shadow-orange-950/30';
const pillIdle =
  'border border-zinc-700 text-zinc-300 hover:bg-zinc-800';

const fieldClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const YesNoToggle = ({ value, onChange, name }) => (
  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
    {[
      { v: true, label: 'Yes' },
      { v: false, label: 'No' },
    ].map((opt) => {
      const active = value === opt.v;
      return (
        <button
          key={String(opt.v)}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(opt.v)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            active ? pillActive : pillIdle
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

/**
 * Two-column CST handover modal: Document Sign + Upscale.
 */
export default function MoveToCstModal({
  open,
  lead,
  onClose,
  onSubmit,
  isSubmitting = false,
}) {
  const [documentSigned, setDocumentSigned] = useState(null);
  const [signedFile, setSignedFile] = useState(null);
  const [upscale, setUpscale] = useState(null);
  const [itemName, setItemName] = useState('');
  const [price, setPrice] = useState('');
  const [upscaleNotes, setUpscaleNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDocumentSigned(null);
    setSignedFile(null);
    setUpscale(null);
    setItemName('');
    setPrice('');
    setUpscaleNotes('');
    setError('');
  }, [open, lead?._id]);

  const canSubmit = useMemo(() => {
    if (documentSigned === null || upscale === null) return false;
    if (documentSigned === true && !signedFile) return false;
    if (upscale === true) {
      if (!itemName.trim()) return false;
      if (price === '' || price == null) return false;
      const n = Number(price);
      if (Number.isNaN(n) || n < 0) return false;
    }
    return true;
  }, [documentSigned, signedFile, upscale, itemName, price]);

  if (!open || !lead) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setSignedFile(null);
      return;
    }
    const okType =
      file.type === 'application/pdf' ||
      file.type === 'image/png' ||
      file.type === 'image/jpeg' ||
      file.type === 'image/jpg' ||
      /\.(pdf|png|jpe?g)$/i.test(file.name);
    if (!okType) {
      setError('Signed document must be PDF, PNG, or JPG.');
      setSignedFile(null);
      e.target.value = '';
      return;
    }
    setError('');
    setSignedFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) {
      setError('Complete Document Sign and Upscale requirements before submitting.');
      return;
    }

    const formData = new FormData();
    formData.append('documentSigned', documentSigned ? 'true' : 'false');
    formData.append('upscale', upscale ? 'true' : 'false');
    formData.append('upscaleNotes', upscaleNotes.trim());
    if (documentSigned && signedFile) {
      formData.append('signedDocument', signedFile);
    }
    if (upscale) {
      formData.append('upscaleItemName', itemName.trim());
      formData.append('upscalePrice', String(price));
    }

    try {
      await onSubmit(formData);
      onClose?.();
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Failed to hand over to CST.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-4 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        aria-label="Close backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        disabled={isSubmitting}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-to-cst-title"
        className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2
              id="move-to-cst-title"
              className="font-display text-lg font-semibold text-white"
            >
              Handover to CST
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {lead.businessName}
              {lead.phone ? ` · ${lead.phone}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-60"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Left — Document Sign */}
            <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <h3 className="text-sm font-semibold text-white">
                Document Sign <span className="text-red-400">*</span>
              </h3>
              <YesNoToggle
                name="Document Sign"
                value={documentSigned}
                onChange={(v) => {
                  setDocumentSigned(v);
                  if (!v) setSignedFile(null);
                }}
              />
              {documentSigned === true ? (
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span className="font-medium">
                    Upload Signed Document{' '}
                    <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-200 hover:file:bg-zinc-700"
                  />
                  {signedFile ? (
                    <span className="block text-xs text-emerald-400">
                      Selected: {signedFile.name}
                    </span>
                  ) : (
                    <span className="block text-xs text-zinc-500">
                      PDF, PNG, or JPG
                    </span>
                  )}
                </label>
              ) : null}
              {documentSigned === false ? (
                <p className="text-xs text-amber-400/90">
                  CST will see: Document not signed by closer
                </p>
              ) : null}
            </section>

            {/* Right — Upscale */}
            <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <h3 className="text-sm font-semibold text-white">
                Upscale <span className="text-red-400">*</span>
              </h3>
              <YesNoToggle
                name="Upscale"
                value={upscale}
                onChange={setUpscale}
              />
              {upscale === true ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span className="font-medium">
                      Item Name <span className="text-red-400">*</span>
                    </span>
                    <input
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. SEO package"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span className="font-medium">
                      Price <span className="text-red-400">*</span>
                    </span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className={`${fieldClass} pl-7`}
                        placeholder="0.00"
                      />
                    </div>
                  </label>
                </div>
              ) : null}
            </section>
          </div>

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span className="font-medium">Upscale Notes</span>
            <textarea
              rows={3}
              value={upscaleNotes}
              onChange={(e) => setUpscaleNotes(e.target.value)}
              placeholder="Handover context for CST…"
              className={`${fieldClass} resize-y`}
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting…' : 'Submit to CST'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
