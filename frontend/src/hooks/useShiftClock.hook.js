import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getShift } from '../services/shift.service.js';

/**
 * Shared shift settings + server-skewed clock.
 * Uses the `shiftSettings` query so Super Admin saves re-render consumers immediately.
 */
export default function useShiftClock() {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['shiftSettings'],
    queryFn: getShift,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
  });

  const settings = data?.settings ?? null;

  const offsetMs = useMemo(() => {
    if (!data?.serverTime) return 0;
    return new Date(data.serverTime).getTime() - Date.now();
  }, [data?.serverTime]);

  const now = useCallback(() => new Date(Date.now() + offsetMs), [offsetMs]);

  return {
    settings,
    now,
    loading: isLoading && !settings,
    refreshing: isFetching,
  };
}
