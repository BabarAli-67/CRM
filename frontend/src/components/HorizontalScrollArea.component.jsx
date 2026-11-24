import { useEffect, useRef, useState } from 'react';

const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, [role="button"], [contenteditable="true"]';

const DRAG_THRESHOLD_PX = 6;

/**
 * Overflow-x container with wheel→horizontal scroll, click-drag pan,
 * and dark thin scrollbar. Skips drag start on interactive controls so
 * buttons / links / email text selection still work.
 */
export default function HorizontalScrollArea({
  children,
  className = '',
}) {
  const ref = useRef(null);
  const drag = useRef({
    pointerId: null,
    startX: 0,
    scrollLeft: 0,
    dragging: false,
    armed: false,
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      // Convert vertical wheel into horizontal pan when the table overflows.
      if (e.deltaY === 0 && e.deltaX === 0) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      el.scrollLeft += delta;
      e.preventDefault();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const endDrag = (e) => {
    const state = drag.current;
    if (state.pointerId == null) return;
    if (e?.pointerId != null && e.pointerId !== state.pointerId) return;
    const el = ref.current;
    if (el && state.pointerId != null) {
      try {
        el.releasePointerCapture(state.pointerId);
      } catch {
        /* already released */
      }
    }
    state.pointerId = null;
    state.armed = false;
    state.dragging = false;
    setIsDragging(false);
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (e.target?.closest?.(INTERACTIVE_SELECTOR)) return;

    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      dragging: false,
      armed: true,
    };
  };

  const onPointerMove = (e) => {
    const state = drag.current;
    if (!state.armed || state.pointerId !== e.pointerId) return;
    const el = ref.current;
    if (!el) return;

    const dx = e.clientX - state.startX;
    if (!state.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      // If the user is already selecting text (e.g. copying an email), abort pan.
      const sel = window.getSelection?.();
      if (sel && sel.type === 'Range' && String(sel).length > 0) {
        state.armed = false;
        state.pointerId = null;
        return;
      }
      // Past threshold — take over as a pan.
      state.dragging = true;
      setIsDragging(true);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      sel?.removeAllRanges?.();
    }

    el.scrollLeft = state.scrollLeft - dx;
    e.preventDefault();
  };

  return (
    <div
      ref={ref}
      className={`overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent ${
        isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
      } ${className}`.trim()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      {children}
    </div>
  );
}
