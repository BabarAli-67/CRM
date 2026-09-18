import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useChatSocket from '../hooks/useChatSocket.hook.js';
import useChatWidget from '../hooks/useChatWidget.hook.js';
import {
  createOrGetConversation,
  getContacts,
  getConversations,
} from '../services/chat.service.js';

const ROLE_LABEL = {
  sales_agent: 'Sales Agent',
  closer: 'Closer',
  cst_manager: 'CST Manager',
  tech_team: 'Tech Team',
  super_admin: 'Super Admin',
  admin: 'Auditor',
};

const formatRelative = (value) => {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(value).toLocaleDateString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
  });
};

export default function ConversationDropdown({ onClose }) {
  const queryClient = useQueryClient();
  const { openChatWindow } = useChatWidget();
  const { onPresenceUpdate, onMessageNew } = useChatSocket();
  const [onlineIds, setOnlineIds] = useState(() => new Set());
  const [actionError, setActionError] = useState('');

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['chatContacts'],
    queryFn: getContacts,
  });

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
  });

  useEffect(() => {
    const offPresence = onPresenceUpdate(({ userId, online }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        const id = String(userId);
        if (online) next.add(id);
        else next.delete(id);
        return next;
      });
    });

    const offMessage = onMessageNew(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    return () => {
      offPresence();
      offMessage();
    };
  }, [onPresenceUpdate, onMessageNew, queryClient]);

  const openMutation = useMutation({
    mutationFn: (contactId) => createOrGetConversation(contactId),
    onSuccess: (conversation, contactId) => {
      const contact = contacts.find((c) => String(c._id) === String(contactId));
      openChatWindow(conversation._id, contact || { _id: contactId });
      onClose?.();
    },
    onError: (err) => {
      setActionError(
        err?.response?.data?.message || 'Could not open conversation.'
      );
    },
  });

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aAt = new Date(a.lastMessageAt || 0).getTime();
      const bAt = new Date(b.lastMessageAt || 0).getTime();
      return bAt - aAt;
    });
  }, [conversations]);

  const handleConversationClick = (row) => {
    const conversationId = row.conversation?._id || row._id;
    const contact = row.otherParticipant;
    if (!conversationId) return;
    openChatWindow(conversationId, contact);
    onClose?.();
  };

  return (
    <div
      className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-2xl"
      role="dialog"
      aria-label="Messenger"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <p className="font-display text-sm font-semibold text-white">Messenger</p>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      {actionError ? (
        <p className="border-b border-zinc-800 px-4 py-2 text-xs text-red-400">
          {actionError}
        </p>
      ) : null}

      <div className="max-h-[28rem] overflow-y-auto">
        <section className="border-b border-zinc-800/80">
          <h3 className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Contacts
          </h3>
          {contactsLoading ? (
            <p className="px-4 py-3 text-sm text-zinc-500">Loading…</p>
          ) : contacts.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">No contacts yet.</p>
          ) : (
            <ul>
              {contacts.map((contact) => {
                const online = onlineIds.has(String(contact._id));
                return (
                  <li key={contact._id}>
                    <button
                      type="button"
                      disabled={openMutation.isPending}
                      onClick={() => {
                        setActionError('');
                        openMutation.mutate(contact._id);
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition hover:bg-zinc-800/50 disabled:opacity-60"
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          online
                            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                            : 'bg-zinc-600'
                        }`}
                        title={online ? 'Online' : 'Offline'}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-100">
                          {contact.fullName}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {ROLE_LABEL[contact.role] || contact.role}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Recent Conversations
          </h3>
          {conversationsLoading ? (
            <p className="px-4 py-3 text-sm text-zinc-500">Loading…</p>
          ) : sortedConversations.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">No conversations yet.</p>
          ) : (
            <ul>
              {sortedConversations.map((row) => {
                const conversationId = row.conversation?._id;
                const peer = row.otherParticipant;
                const unread = row.unreadCount || 0;
                return (
                  <li key={conversationId}>
                    <button
                      type="button"
                      onClick={() => handleConversationClick(row)}
                      className="flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left transition hover:bg-zinc-800/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-zinc-100">
                            {peer?.fullName || 'Unknown'}
                          </span>
                          <span className="shrink-0 text-[11px] text-zinc-500">
                            {formatRelative(row.lastMessageAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className="truncate text-xs text-zinc-500">
                            {row.lastMessagePreview || 'No messages yet'}
                          </span>
                          {unread > 0 ? (
                            <span className="inline-flex min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
