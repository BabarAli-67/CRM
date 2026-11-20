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
 */
export default function GlobalRemindersBridge() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = user?.role;
  const userId = user?._id;

  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      unlockAudioPlayback();
      requestNotificationPermission();
      unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('click', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
    return () => {
      if (!unlocked) {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('click', unlock);
      }
    };
  }, []);

  const isAgent = role === 'sales_agent';
  const isCloser = role === 'closer';
  const isCst = role === 'cst_manager';

  const { data: callbacks = [] } = useQuery({
    queryKey: ['myCallbacks'],
    queryFn: () => getMyCallbacks(false),
    enabled: isAgent,
    refetchInterval: 5_000,
  });

  const { data: closerCallbacks = [] } = useQuery({
    queryKey: ['closerCallbacks'],
    queryFn: getMyCloserCallbacks,
    enabled: isCloser,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
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
          notifyAll: true,
          alerts: {
            fiveMinFired: true,
            exactTimeFired: Boolean(
              lead.handover.retention.alerts?.exactTimeFired
            ),
          },
          businessName: lead.businessName,
          clientName: lead.clientName,
          phone: lead.businessPhone || lead.personalPhone || '',
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
            updatedAt: cb.updatedAt,
            notifyUserIds: agentId ? [String(agentId)] : [],
            alerts: {
              fiveMinFired: Boolean(cb.alerts?.fiveMinFired),
              exactTimeFired: Boolean(cb.alerts?.exactTimeFired),
            },
            businessName: cb.businessName,
            phone: cb.businessPhone || cb.personalPhone || '',
            item: cb,
          };
        });
      return [
        ...callbackItems,
        ...buildLeadFollowUpReminders(myLeads, userId, {
          role: 'sales_agent',
        }),
      ];
    }

    if (isCloser) {
      const uid = String(userId || '');
      const callbackItems = (closerCallbacks || [])
        .filter((cb) => cb.status === 'pending')
        .filter((cb) => {
          const owner = String(cb.closerId?._id || cb.closerId || '');
          const assigned = String(
            cb.assignedCloserId?._id || cb.assignedCloserId || ''
          );
          return !uid || owner === uid || assigned === uid;
        })
        .map((cb) => {
          const notify = new Set();
          const owner = cb.closerId?._id || cb.closerId;
          const assigned = cb.assignedCloserId?._id || cb.assignedCloserId;
          if (owner) notify.add(String(owner));
          if (assigned) notify.add(String(assigned));
          if (uid) notify.add(uid);
          return {
            id: cb._id,
            kind: 'closer_callback',
            triggerAt: cb.callbackAt,
            createdAt: cb.createdAt,
            updatedAt: cb.updatedAt,
            notifyUserIds: [...notify],
            alerts: {
              fiveMinFired: Boolean(cb.alerts?.fiveMinFired),
              exactTimeFired: Boolean(cb.alerts?.exactTimeFired),
            },
            businessName: cb.businessName,
            phone: cb.businessPhone || cb.personalPhone || '',
            item: cb,
          };
        });

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
    pollIntervalMs: isCloser || isAgent ? 5_000 : undefined,
    markAlert: async ({ id, kind, fiveMinFired, exactTimeFired }) => {
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
        const cachedCallbacks =
          queryClient.getQueryData(['closerCallbacks']) || [];
        const source = (
          Array.isArray(cachedCallbacks) ? cachedCallbacks : []
        ).find((c) => String(c._id) === String(id));
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
