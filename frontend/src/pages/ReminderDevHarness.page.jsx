import { useMemo, useState } from 'react';
import useReminderScheduler from '../hooks/useReminderScheduler.js';
import { playChime } from '../utils/audioAlert.js';
import { enqueueReminderPopup } from '../components/alerts/ReminderPopup.jsx';
import { ReminderPopupHost } from '../components/alerts/ReminderPopup.jsx';

/**
 * Dev harness for Phase 4.1 reminder / chime verification.
 * Route: /dev/reminders (no auth — local QA only)
 */
export default function ReminderDevHarnessPage() {
  const [log, setLog] = useState([]);
  const [userId] = useState('agent-a');
  const [items, setItems] = useState([]);

  const append = (line) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${line}`, ...prev].slice(0, 40));

  useReminderScheduler(items, {
    currentUserId: userId,
    showPopup: (payload) => {
      append(
        `POPUP ${payload.kind} ${payload.alertType} id=${payload.id} ${payload.businessName || ''}`
      );
      enqueueReminderPopup({
        ...payload,
        businessName: payload.item?.businessName || 'Harness Biz',
        phone: payload.item?.phone || '+15550001111',
      });
    },
    markAlert: async ({ id, kind, fiveMinFired, exactTimeFired }) => {
      append(
        `MARK ${kind}:${id} fiveMin=${!!fiveMinFired} exact=${!!exactTimeFired}`
      );
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id || item.kind !== kind) return item;
          return {
            ...item,
            alerts: {
              ...item.alerts,
              ...(fiveMinFired ? { fiveMinFired: true } : {}),
              ...(exactTimeFired ? { exactTimeFired: true } : {}),
            },
          };
        })
      );
    },
  });

  const scheduleFiveMinSoon = () => {
    // callbackAt = now + 5m + 12s → fiveMin fires in ~12s
    const triggerAt = new Date(Date.now() + 5 * 60 * 1000 + 12_000).toISOString();
    setItems([
      {
        id: 'cb-5min',
        kind: 'callback',
        triggerAt,
        notifyUserIds: ['agent-a'],
        businessName: 'Five-Min Test Co',
        phone: '+15551110001',
        alerts: { fiveMinFired: false, exactTimeFired: false },
        item: {
          businessName: 'Five-Min Test Co',
          phone: '+15551110001',
        },
      },
    ]);
    append(`Scheduled 5-min scenario (fires ~12s). triggerAt=${triggerAt}`);
  };

  const scheduleExactCatchup = () => {
    // Within 60s catch-up window for exact time
    const triggerAt = new Date(Date.now() - 15_000).toISOString();
    setItems([
      {
        id: 'cb-exact',
        kind: 'callback',
        triggerAt,
        notifyUserIds: ['agent-a'],
        businessName: 'Exact Catchup Co',
        phone: '+15551110002',
        alerts: { fiveMinFired: true, exactTimeFired: false },
        item: {
          businessName: 'Exact Catchup Co',
          phone: '+15551110002',
        },
      },
    ]);
    append('Scheduled exact catch-up (should fire immediately, double chime)');
  };

  const scheduleIsolation = () => {
    const triggerAt = new Date(Date.now() - 10_000).toISOString();
    setItems([
      {
        id: 'cb-other',
        kind: 'callback',
        triggerAt,
        notifyUserIds: ['agent-b'],
        businessName: 'Other Agent Co',
        phone: '+15551110003',
        alerts: { fiveMinFired: false, exactTimeFired: false },
        item: { businessName: 'Other Agent Co', phone: '+15551110003' },
      },
    ]);
    append('Scheduled Agent B item while logged in as agent-a (should NOT fire)');
  };

  const scheduleSharedFollowup = () => {
    const triggerAt = new Date(Date.now() - 10_000).toISOString();
    setItems([
      {
        id: 'fu-shared',
        kind: 'followup',
        triggerAt,
        notifyUserIds: ['agent-a', 'closer-a'],
        businessName: 'Shared Follow-up Co',
        phone: '+15551110004',
        alerts: { fiveMinFired: false, exactTimeFired: false },
        item: {
          businessName: 'Shared Follow-up Co',
          phone: '+15551110004',
        },
      },
    ]);
    append('Scheduled shared follow-up (agent-a should fire; closer would too if currentUserId set)');
  };

  const simulateRefreshNoDuplicate = () => {
    const triggerAt = new Date(Date.now() - 10_000).toISOString();
    setItems([
      {
        id: 'cb-refresh',
        kind: 'callback',
        triggerAt,
        notifyUserIds: ['agent-a'],
        businessName: 'Already Fired Co',
        phone: '+15551110005',
        alerts: { fiveMinFired: true, exactTimeFired: true },
        item: {
          businessName: 'Already Fired Co',
          phone: '+15551110005',
        },
      },
    ]);
    append('Simulated refresh with both flags true (should NOT re-fire)');
  };

  const itemSummary = useMemo(
    () =>
      items.map((i) => ({
        id: i.id,
        kind: i.kind,
        alerts: i.alerts,
        notifyUserIds: i.notifyUserIds,
      })),
    [items]
  );

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <ReminderPopupHost />
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Phase 4.1 Reminder Harness</h1>
        <p className="text-sm text-slate-600">
          Click anywhere first to unlock AudioContext. currentUserId=
          <code className="rounded bg-white px-1">{userId}</code>
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={async () => {
              await playChime('single');
              append("playChime('single') called");
            }}
          >
            TC1 playChime single
          </button>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={async () => {
              await playChime('double');
              append("playChime('double') called");
            }}
          >
            TC2 playChime double
          </button>
          <button
            type="button"
            className="rounded-md bg-amber-700 px-3 py-2 text-sm text-white"
            onClick={scheduleFiveMinSoon}
          >
            TC3 schedule 5-min (~12s)
          </button>
          <button
            type="button"
            className="rounded-md bg-amber-700 px-3 py-2 text-sm text-white"
            onClick={scheduleExactCatchup}
          >
            TC4 exact catch-up
          </button>
          <button
            type="button"
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white"
            onClick={simulateRefreshNoDuplicate}
          >
            TC5 refresh no-dupe
          </button>
          <button
            type="button"
            className="rounded-md bg-rose-700 px-3 py-2 text-sm text-white"
            onClick={scheduleIsolation}
          >
            TC6 isolation
          </button>
          <button
            type="button"
            className="rounded-md bg-indigo-700 px-3 py-2 text-sm text-white"
            onClick={scheduleSharedFollowup}
          >
            TC7 shared follow-up
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={() => {
              setItems([]);
              append('Cleared items');
            }}
          >
            Clear schedule
          </button>
        </div>

        <pre className="overflow-auto rounded-md border border-slate-200 bg-white p-3 text-xs">
          {JSON.stringify(itemSummary, null, 2)}
        </pre>

        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="mb-2 text-sm font-semibold">Event log</p>
          <ul className="space-y-1 font-mono text-xs text-slate-700">
            {log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
