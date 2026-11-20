import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ConversationDropdown from './ConversationDropdown.component.jsx';
import { getConversations } from '../services/chat.service.js';

function ChatBubbleIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l1.9-4.6A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}

/**
 * Compact bottom-right Team Chat FAB — circular #F25E26 icon button.
 * Opens the existing conversation dropdown above the button.
 */
export default function MessengerIcon() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    refetchInterval: 60_000,
  });

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (sum, row) =>
          sum + (typeof row.unreadCount === 'number' ? row.unreadCount : 0),
        0
      ),
    [conversations]
  );

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="absolute bottom-full right-0 mb-3">
          <ConversationDropdown onClose={() => setOpen(false)} />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Team Chat"
        aria-expanded={open}
        className="group relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#F25E26] text-white shadow-lg shadow-[#F25E26]/25 transition duration-200 hover:scale-105 hover:bg-[#ff6a33] hover:shadow-xl hover:shadow-[#F25E26]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <ChatBubbleIcon className="h-5 w-5 text-white" />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#222222] bg-[#111111] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          Team Chat
        </span>
        {totalUnread > 0 ? (
          <span
            className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0A0A0A] bg-white"
            aria-label={`${totalUnread} unread`}
          />
        ) : null}
      </button>
    </div>
  );
}
