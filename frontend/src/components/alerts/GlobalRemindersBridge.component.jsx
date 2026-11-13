import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useAuth from '../../hooks/useAuth.hook.js';
import useReminderScheduler from '../../hooks/useReminderScheduler.js';
import {
  getMyCallbacks,
  getMyCloserCallbacks,
  markCallbackAlert,
  markCloserCallbackAlert,
} from '../../services/callback.service.js';
import {
  getRetentionReminders,
  markRetentionAlert,
} from '../../services/handover.service.js';
import {
  getAssignedLeads,
  getMyLeads,
  markLeadFollowUpAlert,
} from '../../services/lead.service.js';
import { unlockAudioPlayback } from '../../utils/audioAlert.js';
import { requestNotificationPermission } from '../../utils/browserNotification.util.js';
import { buildLeadFollowUpReminders } from '../../utils/leadReminders.js';

/**
 * Always-on reminder bridge for department dashboards (Agent + Closer + CST).
 * Keeps independent 5-min (warning) + on-time (due) timers alive on every tab.
 * CST retention uses the same exact-time due window as Agent/Closer callbacks
 * (fiveMinFired pre-set so only the on-time phase arms).
 * Dismissing warning must never mute the due chime — each phase has its own flag:
 *   alerts.fiveMinFired  ≈ warningTriggered
 *   alerts.exactTimeFired ≈ dueTriggered
 */
export default function GlobalRemindersBridge() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = user?.role;
  const userId = user?._id;

  useEffect(() => {
    const unlock = () => {
      unlockAudioPlayback();
      requestNotificationPermission();
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const isAgent = role === 'sales_agent';
  const isCloser = role === 'closer';
  const isCst = role === 'cst_manager';

  const { data: callbacks = [] } = useQuery({
    queryKey: ['myCallbacks'],
    queryFn: () => getMyCallbacks(false),
    enabled: isAgent,
    refetchInterval: 30_000,
  });

  const { data: closerCallbacks = [] } = useQuery({
    queryKey: ['closerCallbacks'],
    queryFn: getMyCloserCallbacks,
    enabled: isCloser,
    refetchInterval: 30_000,
  });

  const { data: myLeads = [] } = useQuery({
    queryKey: ['myLeads'],
    queryFn: getMyLeads,
    enabled: isAgent,
    refetchInterval: 30_000,
  });

  const { data: assignedLeads = [] } = useQuery({
    queryKey: ['assignedLeads'],
    queryFn: getAssignedLeads,
    enabled: isCloser,
    refetchInterval: 30_000,
  });

  const { data: retentionLeads = [] } = useQuery({
    queryKey: ['retentionReminders'],
    queryFn: getRetentionReminders,
    enabled: isCst,
    refetchInterval: 3_000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchIntervalInBackground: true,
  });

  const reminderItems = useMemo(() => {
    if (isCst) {
      const uid = String(userId || user?.id || '');
      return (retentionLeads || [])
        .filter(
          (lead) =>
            lead?.handover?.retention?.at &&
            lead?.handover?.retention?.status === 'scheduled' &&
            // Still awaiting CST dismiss / mark-done
            !Boolean(lead?.handover?.retention?.alerts?.exactTimeFired)
        )
        .map((lead) => ({
          id: lead._id,
          kind: 'retention',
          triggerAt: lead.handover.retention.at,
          createdAt:
            lead.handover?.retention?.at ||
            lead.updatedAt ||
            lead.createdAt,
          notifyUserIds: uid ? [uid] : [],
          // Retention is desk-wide: ring for whichever CST Manager is signed in
          notifyAll: true,
          alerts: {
            // Exact-time only — same as callbacks once fiveMin is skipped
            fiveMinFired: true,
            exactTimeFired: Boolean(
              lead.handover.retention.alerts?.exactTimeFired
            ),
          },
          businessName: lead.businessName,
          clientName: lead.clientName,
          phone: lead.phone,
          item: lead,
        }));
    }

    if (isAgent) {
      const callbackItems = (callbacks || [])
        .filter((cb) => cb.status === 'pending')
        .map((cb) => {
          const agentId = cb.agentId?._id || cb.agentId || userId;
          return {
            id: cb._id,
            kind: 'callback',
            triggerAt: cb.callbackAt,
            createdAt: cb.createdAt,
            notifyUserIds: agentId ? [String(agentId)] : [],
            // warningTriggered / dueTriggered (persisted as fiveMinFired / exactTimeFired)
            alerts: {
              fiveMinFired: Boolean(cb.alerts?.fiveMinFired),
              exactTimeFired: Boolean(cb.alerts?.exactTimeFired),
            },
            businessName: cb.businessName,
            phone: cb.phone,
            item: cb,
          };
        });
      return [
        ...callbackItems,
        ...buildLeadFollowUpReminders(myLeads, userId, { role: 'sales_agent' }),
      ];
    }

    if (isCloser) {
      // Closer personal callbacks — same dual-phase alerts as agent
      const callbackItems = (closerCallbacks || [])
        .filter((cb) => cb.status === 'pending')
        .map((cb) => {
          const closerId = cb.closerId?._id || cb.closerId || userId;
          return {
            id: cb._id,
            kind: 'closer_callback',
            triggerAt: cb.callbackAt,
            createdAt: cb.createdAt,
            notifyUserIds: closerId ? [String(closerId)] : [String(userId)],
            alerts: {
              fiveMinFired: Boolean(cb.alerts?.fiveMinFired),
              exactTimeFired: Boolean(cb.alerts?.exactTimeFired),
            },
            businessName: cb.businessName,
            phone: cb.phone,
            item: cb,
          };
        });

      // Prefer closer_callback when a lead already has one — avoids double
      // popups and flag races that can mute the due chime on the lead follow-up.
      const leadIdsCoveredByCloserCb = new Set(
        callbackItems
          .map((item) => {
            const leadRef = item.item?.leadId;
            return String(leadRef?._id || leadRef || '');
          })
          .filter(Boolean)
      );

      const followups = buildLeadFollowUpReminders(assignedLeads, userId, {
        role: 'closer',
      }).filter((f) => !leadIdsCoveredByCloserCb.has(String(f.id)));

      return [...callbackItems, ...followups];
    }

    return [];
  }, [
    isAgent,
    isCloser,
    isCst,
    callbacks,
    closerCallbacks,
    myLeads,
    assignedLeads,
    retentionLeads,
    userId,
    user?.id,
  ]);

  useReminderScheduler(reminderItems, {
    markAlert: async ({ id, kind, fiveMinFired, exactTimeFired }) => {
      // Phase-scoped only — never send both flags unless both were requested
      const patch = {
        ...(typeof fiveMinFired === 'boolean' ? { fiveMinFired } : {}),
        ...(typeof exactTimeFired === 'boolean' ? { exactTimeFired } : {}),
      };

      const mergeAlerts = (oldAlerts = {}) => ({
        fiveMinFired: Boolean(oldAlerts.fiveMinFired),
        exactTimeFired: Boolean(oldAlerts.exactTimeFired),
        ...patch,
      });

      if (kind === 'retention') {
        // Same as callbacks: persist phase flag when the scheduler fires (and on OK)
        if (typeof exactTimeFired === 'boolean' && exactTimeFired) {
          queryClient.setQueryData(['retentionReminders'], (old) => {
            if (!Array.isArray(old)) return old;
            return old.map((lead) => {
              if (String(lead._id) !== String(id)) return lead;
              return {
                ...lead,
                handover: {
                  ...(lead.handover || {}),
                  retention: {
                    ...(lead.handover?.retention || {}),
                    alerts: {
                      fiveMinFired: true,
                      exactTimeFired: true,
                    },
                  },
                },
              };
            });
          });
          await markRetentionAlert(id, { exactTimeFired: true });
          queryClient.invalidateQueries({ queryKey: ['retentionReminders'] });
        }
        return;
      }

      if (kind === 'callback') {
        queryClient.setQueryData(['myCallbacks'], (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((cb) =>
            String(cb._id) === String(id)
              ? { ...cb, alerts: mergeAlerts(cb.alerts) }
              : cb
          );
        });
        await markCallbackAlert(id, patch);
        queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
        return;
      }

      if (kind === 'closer_callback') {
        queryClient.setQueryData(['closerCallbacks'], (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((cb) =>
            String(cb._id) === String(id)
              ? { ...cb, alerts: mergeAlerts(cb.alerts) }
              : cb
          );
        });
        // Keep assigned-leads follow-up flags in sync when this callback is lead-linked
        const cachedCallbacks =
          queryClient.getQueryData(['closerCallbacks']) || [];
        const source = (Array.isArray(cachedCallbacks) ? cachedCallbacks : []).find(
          (c) => String(c._id) === String(id)
        );
        const leadId = source?.leadId?._id || source?.leadId;
        if (leadId) {
          queryClient.setQueryData(['assignedLeads'], (old) => {
            if (!Array.isArray(old)) return old;
            return old.map((lead) => {
              if (String(lead._id) !== String(leadId)) return lead;
              if (!lead.followUp) return lead;
              return {
                ...lead,
                followUp: {
                  ...lead.followUp,
                  alerts: mergeAlerts(lead.followUp.alerts),
                },
              };
            });
          });
        }
        await markCloserCallbackAlert(id, patch);
        queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
        queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
        return;
      }

      const patchLeadList = (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((lead) => {
          if (String(lead._id) !== String(id)) return lead;
          return {
            ...lead,
            followUp: {
              ...(lead.followUp || {}),
              alerts: mergeAlerts(lead.followUp?.alerts),
            },
          };
        });
      };
      queryClient.setQueryData(['myLeads'], patchLeadList);
      queryClient.setQueryData(['assignedLeads'], patchLeadList);
      await markLeadFollowUpAlert(id, patch);
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    },
  });

  return null;
}
