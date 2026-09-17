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
      <section className="w-full rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">
              Scheduled callbacks
            </h2>
            <p className="mt-1 text-sm text-ink/70">
              Sorted by time · overdue rows are highlighted · reminders chime in
              this tab
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded-xl bg-flash-primary px-4 py-2.5 font-display text-sm font-semibold text-white transition hover:bg-flash-secondary"
          >
            + New Callback
          </button>
        </div>

        {actionError ? (
          <p role="alert" className="mb-3 text-sm text-red-300">
            {actionError}
          </p>
        ) : null}
        {actionMessage ? (
          <p className="mb-3 text-sm text-emerald-300">{actionMessage}</p>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-ink/60">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-300">
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
