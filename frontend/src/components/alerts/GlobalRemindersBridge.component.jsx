import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useAuth from '../../hooks/useAuth.hook.js';
import useReminderScheduler from '../../hooks/useReminderScheduler.js';
import {
  getMyCallbacks,
  markCallbackAlert,
} from '../../services/callback.service.js';
import {
  getAssignedLeads,
  getMyLeads,
  markLeadFollowUpAlert,
} from '../../services/lead.service.js';
import { unlockAudioPlayback } from '../../utils/audioAlert.js';
import { requestNotificationPermission } from '../../utils/browserNotification.util.js';
import { buildLeadFollowUpReminders } from '../../utils/leadReminders.js';

/**
 * Always-on reminder bridge for department dashboards.
 * Keeps 5-min + on-time timers alive on every tab (Attendance, Leads, etc.),
 * not only while My Callbacks / My Leads is mounted.
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

  const { data: callbacks = [] } = useQuery({
    queryKey: ['myCallbacks'],
    queryFn: () => getMyCallbacks(false),
    enabled: isAgent,
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

  const reminderItems = useMemo(() => {
    if (isAgent) {
      const callbackItems = (callbacks || []).map((cb) => {
        const agentId = cb.agentId?._id || cb.agentId || userId;
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
      });
      return [
        ...callbackItems,
        ...buildLeadFollowUpReminders(myLeads, userId, { role: 'sales_agent' }),
      ];
    }

    if (isCloser) {
      return buildLeadFollowUpReminders(assignedLeads, userId, {
        role: 'closer',
      });
    }

    return [];
  }, [isAgent, isCloser, callbacks, myLeads, assignedLeads, userId]);

  useReminderScheduler(reminderItems, {
    markAlert: async ({ id, kind, fiveMinFired, exactTimeFired }) => {
      if (kind === 'callback') {
        await markCallbackAlert(id, {
          ...(typeof fiveMinFired === 'boolean' ? { fiveMinFired } : {}),
          ...(typeof exactTimeFired === 'boolean' ? { exactTimeFired } : {}),
        });
        queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
        return;
      }

      await markLeadFollowUpAlert(id, {
        ...(typeof fiveMinFired === 'boolean' ? { fiveMinFired } : {}),
        ...(typeof exactTimeFired === 'boolean' ? { exactTimeFired } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    },
  });

  return null;
}
