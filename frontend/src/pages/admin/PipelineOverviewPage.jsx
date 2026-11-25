import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import useAuth from '../../hooks/useAuth.hook.js';
import { getAllCallbacks } from '../../services/callback.service.js';
import { getAllLeads } from '../../services/lead.service.js';
import { getHandoverQueue } from '../../services/handover.service.js';
import OverrideReassignModal from '../../components/handover/OverrideReassignModal.jsx';
import SessionIdentityBadge from '../../components/SessionIdentityBadge.component.jsx';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
  formatCstStatus,
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';
import {
  currentPktMonth,
  formatPktMonthLabel,
  pktMonthKey,
} from '../../utils/pktMonth.util.js';
import {
  ADMIN_BTN_GHOST,
  ADMIN_BTN_PRIMARY,
  ADMIN_CANVAS,
  ADMIN_CARD,
  ADMIN_ROW,
  ADMIN_TABLE_WRAP,
  ADMIN_THEAD,
} from '../../components/adminBrand.js';

const TABS = [
  { id: 'callbacks', label: 'Callbacks' },
  { id: 'activeLeads', label: 'Active Leads' },
  { id: 'closedSales', label: 'Closed Sales' },
  { id: 'handover', label: 'Handover Queue' },
  { id: 'techProjects', label: 'Tech Projects' },
];

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const personLabel = (ref) => formatUserRef(ref) || '—';

/** Payment summary — never render cardReferenceToken. */
function paymentSummary(payment) {
  return formatPaymentSummary(payment);
}

/**
 * Unified Super Admin / Auditor pipeline.
 * Same component tree for both roles; write controls only when
 * useAuth().user.isAdmin === true (super_admin).
 */
export default function PipelineOverviewPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('callbacks');
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [detailLead, setDetailLead] = useState(null);
  const [flash, setFlash] = useState('');
  const [closedMonth, setClosedMonth] = useState(currentPktMonth);
  const closedMonthPinnedRef = useRef(false);

  // Spec: isAdmin true ONLY for super_admin — Auditor is byte-identical minus writes
  const canWrite = user?.isAdmin === true;
  const homePath = user?.role === 'admin' ? '/admin/monitor' : '/admin';
  const liveClosedMonth = currentPktMonth();

  useEffect(() => {
    const id = window.setInterval(() => {
      if (closedMonthPinnedRef.current) return;
      const live = currentPktMonth();
      setClosedMonth((prev) => (prev === live ? prev : live));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const selectClosedMonth = (value) => {
    const next = value || currentPktMonth();
    closedMonthPinnedRef.current = next !== currentPktMonth();
    setClosedMonth(next);
  };

  const callbacksQuery = useQuery({
    queryKey: ['pipeline', 'callbacks'],
    queryFn: getAllCallbacks,
    enabled: tab === 'callbacks',
    refetchInterval: 60_000,
  });

  const leadsQuery = useQuery({
    queryKey: ['pipeline', 'leads'],
    queryFn: getAllLeads,
    enabled: ['activeLeads', 'closedSales', 'techProjects'].includes(tab),
    refetchInterval: 30_000,
  });

  const handoverQuery = useQuery({
    queryKey: ['pipeline', 'handoverQueue'],
    queryFn: getHandoverQueue,
    enabled: tab === 'handover',
    refetchInterval: 60_000,
  });

  const allLeads = leadsQuery.data || [];

  const activeLeads = useMemo(
    () => allLeads.filter((l) => l.stage === 'active'),
    [allLeads]
  );

  const closedSales = useMemo(
    () =>
      allLeads.filter(
        (l) =>
          l.stage === 'closed_sale' && pktMonthKey(l.closedAt) === closedMonth
      ),
    [allLeads, closedMonth]
  );

  const techProjects = useMemo(
    () =>
      allLeads.filter(
        (l) =>
          l.stage === 'closed_sale' &&
          l.handover?.assignedTechId &&
          ['assigned', 'in_progress', 'completed'].includes(
            l.handover?.cstStatus
          )
      ),
    [allLeads]
  );

  const invalidatePipeline = () => {
    queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
    queryClient.invalidateQueries({ queryKey: ['allCallbacks'] });
  };

  return (
    <div className={ADMIN_CANVAS}>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
        <header
          className={`${ADMIN_CARD} flex flex-wrap items-center justify-between gap-4`}
        >
          <div>
            <Link
              to={homePath}
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Link>
            <img
              src="/logo.webp"
              alt="Flash Tech"
              className="h-8 w-auto max-w-[160px] object-contain object-left"
            />
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Pipeline Overview
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {canWrite
                ? 'Super Admin · full pipeline with override controls'
                : 'Auditor · read-only pipeline (identical layout)'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SessionIdentityBadge user={user} />
            <button type="button" onClick={logout} className={ADMIN_BTN_GHOST}>
              Log out
            </button>
          </div>
        </header>

        {flash ? (
          <p className="text-sm text-emerald-300">{flash}</p>
        ) : null}

        <nav
          className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.07] bg-[#131518]/60 p-1.5 backdrop-blur-md"
          aria-label="Pipeline tabs"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFlash('');
                  setTab(item.id);
                }}
                className={`relative flex-1 rounded-xl px-4 py-2.5 font-display text-sm font-semibold transition sm:flex-none ${
                  active
                    ? 'bg-gradient-to-r from-[#FF4B26] via-[#F23B18] to-[#C92000] text-white shadow-lg shadow-orange-950/40'
                    : 'text-zinc-400 hover:bg-white/[0.03] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {tab === 'callbacks' ? (
          <CallbacksPanel query={callbacksQuery} />
        ) : null}

        {tab === 'activeLeads' ? (
          <ActiveLeadsPanel
            leads={activeLeads}
            isLoading={leadsQuery.isLoading}
            isError={leadsQuery.isError}
            error={leadsQuery.error}
            onViewDetails={setDetailLead}
          />
        ) : null}

        {tab === 'closedSales' ? (
          <ClosedSalesPanel
            leads={closedSales}
            month={closedMonth}
            liveMonth={liveClosedMonth}
            onMonthChange={selectClosedMonth}
            isLoading={leadsQuery.isLoading}
            isError={leadsQuery.isError}
            error={leadsQuery.error}
            canWrite={canWrite}
            onViewDetails={setDetailLead}
            onOverride={(lead) => {
              setFlash('');
              setOverrideTarget(lead);
            }}
          />
        ) : null}

        {tab === 'handover' ? (
          <HandoverPanel
            query={handoverQuery}
            canWrite={canWrite}
            onViewDetails={setDetailLead}
            onOverride={(lead) => {
              setFlash('');
              setOverrideTarget(lead);
            }}
          />
        ) : null}

        {tab === 'techProjects' ? (
          <TechProjectsPanel
            leads={techProjects}
            isLoading={leadsQuery.isLoading}
            isError={leadsQuery.isError}
            error={leadsQuery.error}
            canWrite={canWrite}
            onOverride={(lead) => {
              setFlash('');
              setOverrideTarget(lead);
            }}
          />
        ) : null}
      </div>

      {canWrite ? (
        <OverrideReassignModal
          open={Boolean(overrideTarget)}
          lead={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onSuccess={() => {
            setFlash('Override applied.');
            invalidatePipeline();
          }}
        />
      ) : null}

      <LeadDetailModal
        open={Boolean(detailLead)}
        lead={detailLead}
        onClose={() => setDetailLead(null)}
      />
    </div>
  );
}

function LoadingOrError({ isLoading, isError, error, empty, children, rows }) {
  if (isLoading) {
    return <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>;
  }
  if (isError) {
    return (
      <p className="py-10 text-center text-sm text-red-300">
        {error?.response?.data?.message || 'Failed to load.'}
      </p>
    );
  }
  if (!rows?.length) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500">{empty}</p>
    );
  }
  return children;
}

function CallbacksPanel({ query }) {
  const rows = query.data || [];
  return (
    <section className={ADMIN_TABLE_WRAP}>
      <LoadingOrError
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        rows={rows}
        empty="No callbacks."
      >
        <table className="min-w-full text-left text-sm text-zinc-200">
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Callback (PKT)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id} className={ADMIN_ROW}>
                <td className="px-4 py-3 font-medium text-white">
                  {row.businessName}
                </td>
                <td className="px-4 py-3">{personLabel(row.agentId)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.businessPhone || row.personalPhone || '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatPkt(row.callbackAt)}
                </td>
                <td className="px-4 py-3">{row.status || '—'}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </LoadingOrError>
    </section>
  );
}

function ActiveLeadsPanel({ leads, isLoading, isError, error, onViewDetails }) {
  const statusLabel = (status) => {
    if (status === 'with_closer' || status === 'in_progress') return 'With Closer';
    if (status === 'pending_closer_claim') return 'With Closer';
    if (status === 'with_agent') return 'With Agent';
    return status || 'With Agent';
  };

  return (
    <section className={ADMIN_TABLE_WRAP}>
      <LoadingOrError
        isLoading={isLoading}
        isError={isError}
        error={error}
        rows={leads}
        empty="No active leads."
      >
        <table className="min-w-full text-left text-sm text-zinc-200">
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Agent / Created By</th>
              <th className="px-4 py-3">Closer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((row) => (
              <tr key={row._id} className={ADMIN_ROW}>
                <td className="px-4 py-3 font-medium text-white">
                  {row.businessName}
                </td>
                <td className="px-4 py-3">{personLabel(row.agentId)}</td>
                <td className="px-4 py-3">{personLabel(row.closerId)}</td>
                <td className="px-4 py-3">{statusLabel(row.status)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.businessPhone || row.personalPhone || '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onViewDetails?.(row)}
                    className={`${ADMIN_BTN_GHOST} !px-2.5 !py-1.5 text-xs`}
                  >
                    View details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </LoadingOrError>
    </section>
  );
}

function ClosedSalesPanel({
  leads,
  month,
  liveMonth,
  onMonthChange,
  isLoading,
  isError,
  error,
  canWrite,
  onOverride,
  onViewDetails,
}) {
  const viewingArchive = month !== liveMonth;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-zinc-400">
          {formatPktMonthLabel(month)} (PKT)
          {viewingArchive ? ' · archive month' : ' · current month'} · historical
          deals retained
        </p>
        <label className="space-y-1 text-xs font-medium text-zinc-400">
          <span>Month (PKT)</span>
          <input
            type="month"
            value={month}
            onChange={(e) => onMonthChange?.(e.target.value)}
            max={liveMonth}
            className="block rounded-lg border border-white/15 bg-[#111111] px-3 py-2 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/60 focus:ring-2 focus:ring-[#F25E26]/30"
            aria-label="Closed sales month (Asia/Karachi)"
          />
        </label>
      </div>
      <div className={ADMIN_TABLE_WRAP}>
      <LoadingOrError
        isLoading={isLoading}
        isError={isError}
        error={error}
        rows={leads}
        empty={`No closed sales in ${formatPktMonthLabel(month)}.`}
      >
        <table className="min-w-full text-left text-sm text-zinc-200">
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Agent / Created By</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">CST status</th>
              <th className="px-4 py-3">Closed (PKT)</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((row) => (
              <tr key={row._id} className={ADMIN_ROW}>
                <td className="px-4 py-3 font-medium text-white">
                  {row.businessName}
                </td>
                <td className="px-4 py-3">{personLabel(row.agentId)}</td>
                <td className="px-4 py-3">{paymentSummary(row.payment)}</td>
                <td className="px-4 py-3">
                  {formatCstStatus(row.handover?.cstStatus)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatPkt(row.closedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onViewDetails?.(row)}
                      className={`${ADMIN_BTN_GHOST} !px-2.5 !py-1.5 text-xs`}
                    >
                      View details
                    </button>
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => onOverride(row)}
                        className={`${ADMIN_BTN_PRIMARY} !px-2.5 !py-1.5 text-xs`}
                      >
                        Override
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </LoadingOrError>
      </div>
    </section>
  );
}

function HandoverPanel({ query, canWrite, onOverride, onViewDetails }) {
  const rows = (query.data || []).filter(
    (l) => l.handover?.cstStatus === 'pending_review'
  );
  return (
    <section className={ADMIN_TABLE_WRAP}>
      <LoadingOrError
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        rows={rows}
        empty="No leads pending CST review."
      >
        <table className="min-w-full text-left text-sm text-zinc-200">
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Agent / Created By</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Closed (PKT)</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id} className={ADMIN_ROW}>
                <td className="px-4 py-3 font-medium text-white">
                  {row.businessName}
                </td>
                <td className="px-4 py-3">{personLabel(row.agentId)}</td>
                <td className="px-4 py-3">{paymentSummary(row.payment)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatPkt(row.closedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onViewDetails?.(row)}
                      className={`${ADMIN_BTN_GHOST} !px-2.5 !py-1.5 text-xs`}
                    >
                      View details
                    </button>
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => onOverride(row)}
                        className={`${ADMIN_BTN_PRIMARY} !px-2.5 !py-1.5 text-xs`}
                      >
                        Assign / Override
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </LoadingOrError>
    </section>
  );
}

function TechProjectsPanel({
  leads,
  isLoading,
  isError,
  error,
  canWrite,
  onOverride,
}) {
  return (
    <section className={ADMIN_TABLE_WRAP}>
      <LoadingOrError
        isLoading={isLoading}
        isError={isError}
        error={error}
        rows={leads}
        empty="No tech projects."
      >
        <table className="min-w-full text-left text-sm text-zinc-200">
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Tech</th>
              <th className="px-4 py-3">Milestone</th>
              <th className="px-4 py-3">Assigned (PKT)</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((row) => (
              <tr key={row._id} className={ADMIN_ROW}>
                <td className="px-4 py-3 font-medium text-white">
                  <Link
                    to={`/admin/client/${row._id}?from=admin`}
                    className="hover:text-orange-300"
                  >
                    {row.businessName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {personLabel(row.handover?.assignedTechId)}
                </td>
                <td className="px-4 py-3">
                  {row.handover?.cstStatus || '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatPkt(row.handover?.assignedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/admin/client/${row._id}?from=admin`}
                      className={`${ADMIN_BTN_GHOST} !px-2.5 !py-1.5 text-xs`}
                    >
                      Open
                    </Link>
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => onOverride(row)}
                        className={`${ADMIN_BTN_PRIMARY} !px-2.5 !py-1.5 text-xs`}
                      >
                        Override
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </LoadingOrError>
    </section>
  );
}
