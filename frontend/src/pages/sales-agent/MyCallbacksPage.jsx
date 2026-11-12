import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import CallbackForm from '../../components/callbacks/CallbackForm.jsx';
import CallbackListTabs from '../../components/callbacks/CallbackListTabs.jsx';
import CallbackTable from '../../components/callbacks/CallbackTable.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';
import {
  createCallback,
  getMyCallbacks,
  updateCallback,
} from '../../services/callback.service.js';
import {
  countCallbacksByTab,
  defaultCallbackListTab,
  filterCallbacksByTab,
} from '../../utils/callbackListTabs.js';

const TAB_EMPTY = {
  all: 'No upcoming callbacks. Use + Add Callback or schedule from My Leads.',
  upcoming: 'No upcoming callbacks.',
  overdue: 'No overdue callbacks.',
  done: 'No completed, attended, or promoted callbacks yet.',
};

export default function MyCallbacksPage() {
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [listTab, setListTab] = useState('upcoming');
  const [tabInitialized, setTabInitialized] = useState(false);

  const {
    data: callbacks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['myCallbacks'],
    queryFn: () => getMyCallbacks(false),
    refetchInterval: 30_000,
  });

  const tabCounts = useMemo(
    () => countCallbacksByTab(callbacks),
    [callbacks]
  );

  useEffect(() => {
    if (tabInitialized || isLoading) return;
    setListTab(defaultCallbackListTab(tabCounts));
    setTabInitialized(true);
  }, [tabInitialized, isLoading, tabCounts]);

  const filteredCallbacks = useMemo(
    () => filterCallbacksByTab(callbacks, listTab),
    [callbacks, listTab]
  );

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editTarget?._id) {
        return updateCallback(editTarget._id, payload);
      }
      return createCallback(payload);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['myCallbacks'], (old) => {
        const list = Array.isArray(old) ? old : [];
        if (!saved?._id) return list;
        const idx = list.findIndex((c) => String(c._id) === String(saved._id));
        if (idx >= 0) {
          const next = [...list];
          next[idx] = saved;
          return next;
        }
        return [...list, saved];
      });
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['adminCallbacks'] });
      setComposerOpen(false);
      setEditTarget(null);
    },
  });

  const closeComposer = () => {
    setComposerOpen(false);
    setEditTarget(null);
  };

  return (
    <SalesAgentShell title="My Callbacks">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              Scheduled callbacks
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Your agenda · 5-min + due-now chimes · also schedule from{' '}
              <Link
                to="/dashboard/sales-agent/leads"
                className="font-medium text-orange-400 hover:text-orange-300 hover:underline"
              >
                My Leads
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditTarget(null);
              setComposerOpen(true);
            }}
            className="rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 hover:bg-orange-500"
          >
            + Add Callback
          </button>
        </div>

        <CallbackListTabs
          activeTab={listTab}
          counts={tabCounts}
          onChange={setListTab}
          ariaLabel="Agent callback sections"
        />

        {isLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load callbacks.'}
          </p>
        ) : (
          <CallbackTable
            callbacks={filteredCallbacks}
            emptyMessage={TAB_EMPTY[listTab] || TAB_EMPTY.all}
            onEdit={(row) => {
              setEditTarget(row);
              setComposerOpen(true);
            }}
          />
        )}
      </section>

      <CallbackForm
        open={composerOpen}
        title={editTarget ? 'Edit Callback' : 'Schedule Callback'}
        initialValues={editTarget}
        isSubmitting={saveMutation.isPending}
        onClose={closeComposer}
        onSubmit={(payload) => saveMutation.mutateAsync(payload)}
      />
    </SalesAgentShell>
  );
}
