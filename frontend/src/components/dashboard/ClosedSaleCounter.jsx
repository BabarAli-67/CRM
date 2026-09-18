import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMyClosedCount } from '../../services/stats.service.js';

/**
 * Monthly closed-sale counter for sales_agent / closer dashboards.
 * Renders count only — never lead details (Vanishing Rule).
 */
export default function ClosedSaleCounter() {
  const { data: count = 0, isLoading, isError } = useQuery({
    queryKey: ['myClosedCount'],
    queryFn: getMyClosedCount,
    refetchInterval: 60_000,
  });

  const [display, setDisplay] = useState(0);
  const prevRef = useRef(null);

  useEffect(() => {
    if (typeof count !== 'number' || Number.isNaN(count)) return;

    const from = prevRef.current === null ? count : prevRef.current;
    prevRef.current = count;

    if (from === count) {
      setDisplay(count);
      return undefined;
    }

    const delta = count - from;
    const steps = Math.min(12, Math.max(1, Math.abs(delta)));
    const stepMs = 40;
    let step = 0;

    const timerId = window.setInterval(() => {
      step += 1;
      const next = Math.round(from + (delta * step) / steps);
      setDisplay(next);
      if (step >= steps) {
        setDisplay(count);
        window.clearInterval(timerId);
      }
    }, stepMs);

    return () => window.clearInterval(timerId);
  }, [count]);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl px-5 py-5 shadow-xl">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Closed sales this month
      </p>
      <p className="mt-2 font-display text-4xl font-semibold tabular-nums tracking-tight text-white">
        {isLoading ? '—' : isError ? '!' : display}
      </p>
      <p className="mt-1 text-xs text-zinc-500">Count only · no lead details</p>
    </div>
  );
}
