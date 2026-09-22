/**
 * OS-level browser notifications for callback / follow-up reminders.
 */

let permissionRequested = false;

/** Ask for Notification permission once (must run from a user gesture ideally). */
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  if (permissionRequested) return Notification.permission;

  permissionRequested = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Show a native notification when permission is granted.
 * No-ops silently if unsupported / denied.
 */
export function showBrowserNotification({ title, body, tag } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const n = new Notification(title || 'Flash CRM Reminder', {
      body: body || '',
      tag: tag || undefined,
      renotify: Boolean(tag),
      requireInteraction: true,
    });

    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      n.close();
    };

    return n;
  } catch {
    return null;
  }
}
