import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMockupRequest,
  listMyMockups,
} from '../../services/mockup.service.js';
import MockupLogoPreview from './MockupLogoPreview.jsx';
import MockupStatusBadge from './MockupStatusBadge.jsx';
import MockupUrlActions from './MockupUrlActions.jsx';

const fieldClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Shared Closer / CST Manager Mockup tab: request form + tracker.
 */
export default function MockupRequesterPanel() {
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');

  const {
    data: mockups = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['myMockups'],
    queryFn: listMyMockups,
    refetchInterval: 20_000,
  });

  const createMutation = useMutation({
    mutationFn: createMockupRequest,
    onSuccess: () => {
      setFormError('');
      setFormMessage('Mockup request sent to Tech Head.');
      setBusinessName('');
      setDescription('');
      setVideoUrl('');
      setLogoFile(null);
      setVideoFile(null);
      queryClient.invalidateQueries({ queryKey: ['myMockups'] });
      queryClient.invalidateQueries({ queryKey: ['mockupBadges'] });
    },
    onError: (err) => {
      setFormMessage('');
      setFormError(
        err?.response?.data?.message || 'Failed to submit mockup request.'
      );
    },
  });

  const [logoPreview, setLogoPreview] = useState(null);
  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const onSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    setFormMessage('');

    if (!businessName.trim()) {
      setFormError('Business Name is required.');
      return;
    }
    if (!description.trim()) {
      setFormError('Description is required.');
      return;
    }

    const fd = new FormData();
    fd.append('businessName', businessName.trim());
    fd.append('description', description.trim());
    if (videoUrl.trim()) fd.append('videoUrl', videoUrl.trim());
    if (logoFile) fd.append('logo', logoFile);
    if (videoFile) fd.append('video', videoFile);

    createMutation.mutate(fd);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-5">
          <h2 className="font-display text-xl font-semibold text-white">
            New Mockup Request
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Sends directly to Tech Head — separate from client onboarding.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-300">
              Business Name <span className="text-[#F25E26]">*</span>
            </span>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className={fieldClass}
              placeholder="Client / business name"
              required
            />
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-300">Logo</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-200"
            />
            <p className="text-[11px] text-zinc-500">Optional logo asset</p>
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo preview"
                className="mt-2 h-16 w-16 rounded-lg border border-zinc-700 object-contain bg-zinc-950"
              />
            ) : null}
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-300">
              Description <span className="text-[#F25E26]">*</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={fieldClass}
              placeholder="Mockup brief / requirements"
              required
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-zinc-300">Video URL</span>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className={fieldClass}
                placeholder="https://… (optional)"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-zinc-300">Video file</span>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-200"
              />
            </label>
          </div>

          {formError ? (
            <p className="text-sm text-red-400" role="alert">
              {formError}
            </p>
          ) : null}
          {formMessage ? (
            <p className="text-sm text-emerald-300" role="status">
              {formMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Submitting…' : 'Send to Tech Head'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-5">
          <h2 className="font-display text-xl font-semibold text-white">
            My Mockup Requests
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Live status tracker — Copy / Open appear when Tech Head delivers the
            URL.
          </p>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load requests.'}
          </p>
        ) : mockups.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No mockup requests yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 font-medium">Business</th>
                  <th className="px-3 py-2 font-medium">Logo</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Mockup URL</th>
                  <th className="px-3 py-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {mockups.map((row) => (
                  <tr
                    key={row._id}
                    className="border-b border-zinc-800/60 align-top"
                  >
                    <td className="px-3 py-3">
                      <p className="font-medium text-white">
                        {row.businessName}
                      </p>
                      <p className="mt-1 max-w-xs text-xs text-zinc-500 line-clamp-2">
                        {row.description}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <MockupLogoPreview
                        mockupId={row._id}
                        hasLogo={Boolean(row.logo?.hasFile)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <MockupStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-3">
                      {row.status === 'delivered' && row.mockupUrl ? (
                        <MockupUrlActions url={row.mockupUrl} />
                      ) : (
                        <span className="text-xs text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">
                      {formatPkt(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
