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
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/55">
        Closed sales this month
      </p>
      <p className="mt-2 font-display text-4xl font-semibold tabular-nums tracking-tight text-ink">
        {isLoading ? '—' : isError ? '!' : display}
      </p>
      <p className="mt-1 text-xs text-ink/50">Count only · no lead details</p>
    </div>
  );
}
