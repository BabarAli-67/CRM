import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import CallbackListTabs from '../../components/callbacks/CallbackListTabs.jsx';
import CloserCallbackTable, {
  summarizeCloserCallbacks,
} from '../../components/callbacks/CloserCallbackTable.jsx';
import CloserScheduleCallbackModal from '../../components/callbacks/CloserScheduleCallbackModal.jsx';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import LeadForm from '../../components/leads/LeadForm.jsx';
import CloserShell from '../../components/closer/CloserShell.jsx';
import CloserTableFilterBar, {
  pktDateKey,
} from '../../components/closer/CloserTableFilterBar.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import { getMyCloserCallbacks } from '../../services/callback.service.js';
import { getAssignedLeads, getLeadById } from '../../services/lead.service.js';
import {
  countCallbacksByTab,
  defaultCallbackListTab,
  filterCallbacksByTab,
} from '../../utils/callbackListTabs.js';
import { leadPrefillFromCallback } from '../../utils/leadPrefillFromCallback.js';

const TAB_EMPTY = {
  all: 'No callbacks scheduled. Use + Add Callback or schedule from Leads.',
  upcoming: 'No upcoming callbacks.',
  overdue: 'No overdue callbacks.',
  done: 'No completed or attended callbacks yet.',
};

export default function CloserMyCallbacksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailLead, setDetailLead] = useState(null);
  const [moveToLeadsCallback, setMoveToLeadsCallback] = useState(null);
  const [listTab, setListTab] = useState('upcoming');
  const [tabInitialized, setTabInitialized] = useState(false);
  const [businessNameFilter, setBusinessNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const {
    data: callbacks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['closerCallbacks'],
    queryFn: getMyCloserCallbacks,
    refetchInterval: 30_000,
  });

  const { data: claimedLeads = [] } = useQuery({
    queryKey: ['assignedLeads'],
    queryFn: getAssignedLeads,
  });

  const summary = useMemo(
    () => summarizeCloserCallbacks(callbacks),
    [callbacks]
  );

  const tabCounts = useMemo(
    () => countCallbacksByTab(callbacks),
    [callbacks]
  );

  useEffect(() => {
    if (tabInitialized || isLoading) return;
    setListTab(defaultCallbackListTab(tabCounts));
    setTabInitialized(true);
  }, [tabInitialized, isLoading, tabCounts]);

  const filteredCallbacks = useMemo(() => {
    const byTab = filterCallbacksByTab(callbacks, listTab);
    const nameQ = businessNameFilter.trim().toLowerCase();
    const emailQ = emailFilter.trim().toLowerCase();
    const dateQ = dateFilter.trim();
    if (!nameQ && !emailQ && !dateQ) return byTab;

    return byTab.filter((row) => {
      if (nameQ) {
        const name = String(row.businessName || '').toLowerCase();
        if (!name.includes(nameQ)) return false;
      }
      if (emailQ) {
        const lead =
          row.leadId && typeof row.leadId === 'object' ? row.leadId : null;
        const personal = String(
          row.personalEmail || lead?.personalEmail || ''
        ).toLowerCase();
        const business = String(
          row.businessEmail || lead?.businessEmail || ''
        ).toLowerCase();
        if (!personal.includes(emailQ) && !business.includes(emailQ)) {
          return false;
        }
      }
      if (dateQ && pktDateKey(row.callbackAt) !== dateQ) {
        return false;
      }
      return true;
    });
  }, [
    callbacks,
    listTab,
    businessNameFilter,
    emailFilter,
    dateFilter,
  ]);

  const hasSearchFilters =
    businessNameFilter.trim() !== '' ||
    emailFilter.trim() !== '' ||
    dateFilter.trim() !== '';

  const clearSearchFilters = () => {
    setBusinessNameFilter('');
    setEmailFilter('');
    setDateFilter('');
  };

  const openLead = async (row) => {
    const leadId = row.leadId?._id || row.leadId;
    if (!leadId) {
      setDetailLead({
        businessName: row.businessName,
        phone: row.businessPhone || row.personalPhone || '',
        personalPhone: row.personalPhone || '',
        businessPhone: row.businessPhone || '',
        notes: row.notes,
      });
      return;
    }
    try {
      const full = await getLeadById(leadId);
      setDetailLead(full);
    } catch {
      setDetailLead(row.leadId || row);
    }
  };

  const moveToLeadsInitialValues = useMemo(
    () =>
      leadPrefillFromCallback(moveToLeadsCallback, {
        closerIdOverride: user?._id,
      }),
    [moveToLeadsCallback, user?._id]
  );

  // Lock page scroll while Move to Leads form is open
  useEffect(() => {
    if (!moveToLeadsCallback) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moveToLeadsCallback]);

  return (
    <CloserShell title="My Callbacks">
      <section className="w-full space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Today's Follow-ups"
            value={summary.today}
            accent="text-sky-300"
            ring="ring-sky-500/25"
          />
          <SummaryCard
            label="Overdue"
            value={summary.overdue}
            accent="text-red-300"
            ring="ring-red-500/30"
          />
          <SummaryCard
            label="Upcoming"
            value={summary.upcoming}
            accent="text-emerald-300"
            ring="ring-emerald-500/25"
          />
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">
                Scheduled Callbacks
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Agenda view · link a claimed lead or add a direct contact ·
                5-min + due-now chimes · also from{' '}
                <Link
                  to="/dashboard/closer/leads"
                  className="font-medium text-orange-400 hover:underline"
                >
                  Leads
                </Link>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 hover:bg-orange-500"
            >
              + Add Callback
            </button>
          </div>

          <CallbackListTabs
            activeTab={listTab}
            counts={tabCounts}
            onChange={setListTab}
            ariaLabel="Closer callback sections"
          />

          <div className="mt-4">
            <CloserTableFilterBar
              businessName={businessNameFilter}
              onBusinessNameChange={setBusinessNameFilter}
              email={emailFilter}
              onEmailChange={setEmailFilter}
              date={dateFilter}
              onDateChange={setDateFilter}
              onClear={clearSearchFilters}
              dateLabel="Date"
            />
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
          ) : isError ? (
            <p className="py-12 text-center text-sm text-red-400">
              {error?.response?.data?.message || 'Failed to load callbacks.'}
            </p>
          ) : (
            <div className="mt-4">
              <CloserCallbackTable
                callbacks={filteredCallbacks}
                onOpenLead={openLead}
                onMoveToLeads={setMoveToLeadsCallback}
                emptyMessage={
                  hasSearchFilters
                    ? 'No callbacks match these filters.'
                    : TAB_EMPTY[listTab] || TAB_EMPTY.all
                }
              />
            </div>
          )}
        </div>
      </section>

      <CloserScheduleCallbackModal
        open={composerOpen}
        allowStandalone
        claimedLeads={claimedLeads}
        onClose={() => setComposerOpen(false)}
      />

      <LeadDetailModal
        open={Boolean(detailLead)}
        lead={detailLead}
        onClose={() => setDetailLead(null)}
      />

      {moveToLeadsCallback && moveToLeadsInitialValues ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6">
          <button
            type="button"
            aria-label="Close Move to Leads backdrop"
            className="absolute inset-0 cursor-default"
            onClick={() => setMoveToLeadsCallback(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="closer-move-to-leads-title"
            className="relative z-10 my-4 w-full max-w-3xl rounded-2xl border border-[#222222] bg-[#111111] p-5 shadow-2xl shadow-black/50 sm:my-8 sm:p-6"
          >
            <div className="mb-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setMoveToLeadsCallback(null)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-sm text-[#A3A3A3] transition hover:bg-white/5 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div id="closer-move-to-leads-title" className="sr-only">
              Move to Leads
            </div>
            <LeadForm
              mode="closerPromote"
              title="Move to Leads"
              initialValues={moveToLeadsInitialValues}
              onCancel={() => setMoveToLeadsCallback(null)}
              onSaved={() => {
                setMoveToLeadsCallback(null);
                queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
                queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
                navigate('/dashboard/closer/leads', {
                  replace: false,
                  state: {
                    toast: 'Lead created from Direct Contact callback.',
                  },
                });
              }}
            />
          </div>
        </div>
      ) : null}
    </CloserShell>
  );
}

function SummaryCard({ label, value, accent, ring }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-5 py-4 ring-1 ${ring}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-1.5 font-display text-3xl font-semibold ${accent}`}>
        {value}
      </p>
    </div>
  );
}
