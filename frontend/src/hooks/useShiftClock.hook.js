import { useCallback, useEffect, useState } from 'react';
import { getShift } from '../services/shift.service.js';

export default function useShiftClock() {
  const [settings, setSettings] = useState(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [loading, setLoading] = useState(true);

  const sync = useCallback(async () => {
    try {
      const { settings: nextSettings, serverTime } = await getShift();
      setSettings(nextSettings);
      setOffsetMs(new Date(serverTime).getTime() - Date.now());
    } catch {
      // Keep last known settings/offset on refresh failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();

    const intervalId = setInterval(sync, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [sync]);

  const now = useCallback(() => new Date(Date.now() + offsetMs), [offsetMs]);

  return { settings, now, loading };
}
