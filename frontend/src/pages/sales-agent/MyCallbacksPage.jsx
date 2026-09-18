import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CallbackForm from '../../components/callbacks/CallbackForm.jsx';
import CallbackTable from '../../components/callbacks/CallbackTable.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import useReminderScheduler from '../../hooks/useReminderScheduler.js';
import {
  createCallback,
  getMyCallbacks,
  markCallbackAlert,
} from '../../services/callback.service.js';

export default function MyCallbacksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

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

  const reminderItems = useMemo(
    () =>
      callbacks.map((cb) => {
        const agentId = cb.agentId?._id || cb.agentId || user?._id;
        return {
          id: cb._id,
          kind: 'callback',
          triggerAt: cb.callbackAt,
          notifyUserIds: agentId ? [String(agentId)] : [],
          alerts: cb.alerts || {
            fiveMinFired: false,
            exactTimeFired: false,
          },
          businessName: cb.businessName,
          phone: cb.phone,
          item: cb,
        };
      }),
    [callbacks, user?._id]
  );

  useReminderScheduler(reminderItems, {
    markAlert: async ({ id, fiveMinFired, exactTimeFired }) => {
      await markCallbackAlert(id, {
        ...(typeof fiveMinFired === 'boolean' ? { fiveMinFired } : {}),
        ...(typeof exactTimeFired === 'boolean' ? { exactTimeFired } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: createCallback,
    onSuccess: () => {
      setActionError('');
      setActionMessage('Callback created.');
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
    },
  });

  return (
    <SalesAgentShell title="My Callbacks">
      <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              Scheduled callbacks
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Sorted by time · overdue rows are highlighted · reminders chime in
              this tab
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="cursor-pointer rounded-full bg-orange-600 px-4 py-2.5 font-display text-sm font-semibold text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-500"
          >
            + New Callback
          </button>
        </div>

        {actionError ? (
          <p role="alert" className="mb-3 text-sm text-red-400">
            {actionError}
          </p>
        ) : null}
        {actionMessage ? (
          <p className="mb-3 text-sm text-emerald-400">{actionMessage}</p>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load callbacks.'}
          </p>
        ) : (
          <CallbackTable callbacks={callbacks} />
        )}
      </section>

      <CallbackForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        isSubmitting={createMutation.isPending}
        onSubmit={(payload) => createMutation.mutateAsync(payload)}
      />
    </SalesAgentShell>
  );
}
