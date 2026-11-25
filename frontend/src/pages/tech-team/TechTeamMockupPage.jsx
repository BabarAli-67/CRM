import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MockupLogoPreview from '../../components/mockup/MockupLogoPreview.jsx';
import MockupStatusBadge from '../../components/mockup/MockupStatusBadge.jsx';
import MockupUrlActions from '../../components/mockup/MockupUrlActions.jsx';
import TechTeamShell from '../../components/tech-team/TechTeamShell.jsx';
import useMockupFile from '../../hooks/useMockupFile.hook.js';
import {
  listAssignedMockups,
  submitMockupUrl,
} from '../../services/mockup.service.js';

const fieldClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

function VideoBlock({ mockup }) {
  const hasFile = Boolean(mockup.videoFile?.hasFile);
  const { url, isLoading } = useMockupFile(mockup._id, 'video', hasFile);

  if (mockup.videoUrl) {
    return (
      <a
        href={mockup.videoUrl}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-orange-300 hover:text-orange-200"
      >
        Open video link
      </a>
    );
  }
  if (!hasFile) return <span className="text-sm text-zinc-500">—</span>;
  if (isLoading) return <span className="text-xs text-zinc-500">Loading…</span>;
  if (!url) return <span className="text-xs text-zinc-500">Unavailable</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-orange-300 hover:text-orange-200"
    >
      Download video
    </a>
  );
}

function MockupCard({ item, urlDrafts, setUrlDrafts, submitMutation }) {
  const draft = urlDrafts[item._id] ?? '';
  const isActive = item.status === 'in_progress';

  return (
    <li className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-semibold text-white">
          {item.businessName}
        </h3>
        <MockupStatusBadge status={item.status} />
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        From {item.requestedByLabel || item.requestedBy?.name}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase text-zinc-500">Logo</p>
          <div className="mt-1">
            <MockupLogoPreview
              mockupId={item._id}
              hasLogo={Boolean(item.logo?.hasFile)}
            />
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase text-zinc-500">Video</p>
          <div className="mt-1">
            <VideoBlock mockup={item} />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] uppercase text-zinc-500">Description</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
          {item.description}
        </p>
      </div>

      {isActive ? (
        <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
          <label className="block space-y-1 text-xs font-medium text-zinc-400">
            <span>Mockup URL</span>
            <input
              type="url"
              value={draft}
              onChange={(e) =>
                setUrlDrafts((prev) => ({
                  ...prev,
                  [item._id]: e.target.value,
                }))
              }
              className={fieldClass}
              placeholder="https://figma.com/… or staging link"
            />
          </label>
          <button
            type="button"
            disabled={!String(draft).trim() || submitMutation.isPending}
            onClick={() =>
              submitMutation.mutate({
                mockupId: item._id,
                mockupUrl: String(draft).trim(),
              })
            }
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            Submit Mockup URL
          </button>
        </div>
      ) : null}

      {(item.status === 'ready_for_review' || item.status === 'delivered') &&
      item.mockupUrl ? (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <p className="mb-2 text-[11px] uppercase text-zinc-500">
            Submitted URL
          </p>
          <MockupUrlActions url={item.mockupUrl} />
        </div>
      ) : null}
    </li>
  );
}

export default function TechTeamMockupPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('in_progress');
  const [search, setSearch] = useState('');
  const [requesterRole, setRequesterRole] = useState('');
  const [urlDrafts, setUrlDrafts] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const {
    data: mockups = [],
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ['assignedMockups'],
    queryFn: listAssignedMockups,
    refetchInterval: 15_000,
  });

  const submitMutation = useMutation({
    mutationFn: ({ mockupId, mockupUrl }) =>
      submitMockupUrl(mockupId, mockupUrl),
    onSuccess: () => {
      setError('');
      setMessage('Mockup URL submitted to Tech Head.');
      setTab('delivered');
      queryClient.invalidateQueries({ queryKey: ['assignedMockups'] });
      queryClient.invalidateQueries({ queryKey: ['mockupBadges'] });
    },
    onError: (err) => {
      setMessage('');
      setError(err?.response?.data?.message || 'Submit failed.');
    },
  });

  const inProgressAll = useMemo(
    () => mockups.filter((m) => m.status === 'in_progress'),
    [mockups]
  );
  const deliveredAll = useMemo(
    () =>
      mockups.filter(
        (m) => m.status === 'ready_for_review' || m.status === 'delivered'
      ),
    [mockups]
  );

  const applyFilters = (rows) => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (requesterRole && row.requestedBy?.role !== requesterRole) return false;
      if (!q) return true;
      const hay = `${row.businessName || ''} ${row.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  };

  const filteredInProgress = useMemo(
    () => applyFilters(inProgressAll),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inProgressAll, search, requesterRole]
  );
  const filteredDelivered = useMemo(
    () => applyFilters(deliveredAll),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliveredAll, search, requesterRole]
  );

  const visible =
    tab === 'in_progress' ? filteredInProgress : filteredDelivered;

  const hasActiveFilters = Boolean(search.trim() || requesterRole);

  return (
    <TechTeamShell title="Mockup">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Assigned Mockups
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Briefs assigned by Tech Head. Submit the completed Mockup URL when
            ready for review.
          </p>
        </div>

        {message ? (
          <p className="mb-3 text-sm text-emerald-300" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('in_progress')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${
              tab === 'in_progress'
                ? 'bg-[#F25E26]/15 text-[#F25E26] ring-[#F25E26]/40'
                : 'bg-zinc-900 text-zinc-400 ring-zinc-700 hover:text-zinc-200'
            }`}
          >
            In Progress
            <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[11px] tabular-nums">
              {inProgressAll.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('delivered')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${
              tab === 'delivered'
                ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/35'
                : 'bg-zinc-900 text-zinc-400 ring-zinc-700 hover:text-zinc-200'
            }`}
          >
            Delivered
            <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[11px] tabular-nums">
              {deliveredAll.length}
            </span>
          </button>
        </div>

        <div className="mb-5 flex flex-wrap items-end gap-2.5 rounded-xl border border-white/10 bg-[#111111]/80 p-3">
          <label className="min-w-[14rem] flex-[2] space-y-1 text-xs font-medium text-zinc-400">
            <span>Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Business name or description…"
              className={fieldClass}
            />
          </label>
          <label className="min-w-[10rem] flex-1 space-y-1 text-xs font-medium text-zinc-400">
            <span>Requester</span>
            <select
              value={requesterRole}
              onChange={(e) => setRequesterRole(e.target.value)}
              className={`${fieldClass} [color-scheme:dark]`}
            >
              <option value="">All</option>
              <option value="closer">Closer</option>
              <option value="cst_manager">CST</option>
            </select>
          </label>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setRequesterRole('');
              }}
              className="shrink-0 rounded-lg border border-[#F25E26]/40 bg-[#F25E26]/15 px-3 py-2 text-xs font-semibold text-[#F25E26] transition hover:bg-[#F25E26]/25"
            >
              Reset
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {loadError?.response?.data?.message || 'Failed to load mockups.'}
          </p>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {tab === 'in_progress'
              ? 'No in-progress mockups match the current filters.'
              : 'No delivered mockups match the current filters.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {visible.map((item) => (
              <MockupCard
                key={item._id}
                item={item}
                urlDrafts={urlDrafts}
                setUrlDrafts={setUrlDrafts}
                submitMutation={submitMutation}
              />
            ))}
          </ul>
        )}
      </section>
    </TechTeamShell>
  );
}
