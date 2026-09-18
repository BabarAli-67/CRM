import { useMemo, useState } from 'react';
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

export default function MessengerIcon() {
  const [open, setOpen] = useState(false);

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    refetchInterval: 60_000,
  });

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (sum, row) => sum + (typeof row.unreadCount === 'number' ? row.unreadCount : 0),
        0
      ),
    [conversations]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open messenger"
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/60 text-zinc-200 transition hover:border-orange-500/40 hover:text-white"
      >
        <ChatBubbleIcon className="h-5 w-5" />
        {totalUnread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        ) : null}
      </button>

      {open ? (
        <ConversationDropdown onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}
