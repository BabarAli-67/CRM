import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useAuth from '../hooks/useAuth.hook.js';
import useAuthenticatedFile from '../hooks/useAuthenticatedFile.hook.js';
import useChatSocket from '../hooks/useChatSocket.hook.js';
import { getMessages, markSeen, sendMessage, uploadFile } from '../services/chat.service.js';
import VoiceRecorder from './VoiceRecorder.component.jsx';

const TYPING_SAFETY_MS = 5000;
const TYPING_EMIT_THROTTLE_MS = 2000;
const TYPING_STOP_DEBOUNCE_MS = 3000;
const MARK_SEEN_WINDOW_MS = 2000;

const sameId = (a, b) => String(a ?? '') === String(b ?? '');

const formatBubbleTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-PK', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatBytes = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDurationSeconds = (seconds) => {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return '';
  const s = Math.floor(n);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const messagePreviewText = (message) => {
  if (!message) return '';
  if (message.type === 'text') return message.text || '';
  if (message.type === 'image') return '📷 Photo';
  if (message.type === 'document') return '📎 Document';
  if (message.type === 'voice') return '🎤 Voice note';
  return message.text || '';
};

function ImageAttachment({ conversationId, attachment, mine }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { url, isLoading, isError } = useAuthenticatedFile(
    conversationId,
    attachment?.storedFilename
  );

  if (isLoading) {
    return (
      <div className="flex h-28 w-40 items-center justify-center rounded-lg bg-black/20 text-[11px] opacity-80">
        Loading…
      </div>
    );
  }

  if (isError || !url) {
    return (
      <p className={`text-xs ${mine ? 'text-orange-100/80' : 'text-zinc-400'}`}>
        Could not load image
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="block cursor-pointer overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400/50"
        aria-label="View image larger"
      >
        <img
          src={url}
          alt={attachment?.originalName || 'Image'}
          className="max-h-40 max-w-full object-contain"
        />
      </button>

      {lightboxOpen ? (
        <div
          className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setLightboxOpen(false);
          }}
        >
          <img
            src={url}
            alt={attachment?.originalName || 'Image'}
            className="max-h-full max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

function DocumentAttachment({ conversationId, attachment, mine }) {
  const [shouldFetch, setShouldFetch] = useState(false);
  const { url, isLoading, isError } = useAuthenticatedFile(
    conversationId,
    shouldFetch ? attachment?.storedFilename : null
  );

  useEffect(() => {
    if (!shouldFetch || !url) return undefined;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = attachment?.originalName || 'download';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Keep the object URL alive briefly so the browser can start the download
    // before the hook disables and revokes it.
    const timer = window.setTimeout(() => {
      setShouldFetch(false);
    }, 750);

    return () => window.clearTimeout(timer);
  }, [shouldFetch, url, attachment?.originalName]);

  const sizeLabel = formatBytes(attachment?.sizeBytes);

  return (
    <button
      type="button"
      onClick={() => {
        if (isLoading) return;
        setShouldFetch(true);
      }}
      disabled={isLoading}
      className={`flex max-w-full cursor-pointer items-start gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-black/10 disabled:cursor-wait ${
        mine ? 'text-white' : 'text-zinc-100'
      }`}
      aria-label={`Download ${attachment?.originalName || 'file'}`}
    >
      <span className="mt-0.5 text-base leading-none" aria-hidden>
        📄
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium underline-offset-2 hover:underline">
          {attachment?.originalName || 'Document'}
        </span>
        <span
          className={`mt-0.5 block text-[10px] ${
            mine ? 'text-orange-100/70' : 'text-zinc-500'
          }`}
        >
          {isLoading
            ? 'Preparing download…'
            : isError
              ? 'Download failed — try again'
              : sizeLabel || 'File'}
        </span>
      </span>
    </button>
  );
}

function VoiceAttachment({ conversationId, attachment, mine }) {
  const { url, isLoading, isError } = useAuthenticatedFile(
    conversationId,
    attachment?.storedFilename
  );
  const durationLabel = formatDurationSeconds(attachment?.durationSeconds);

  if (isLoading) {
    return (
      <p className={`text-xs ${mine ? 'text-orange-100/80' : 'text-zinc-400'}`}>
        Loading voice note…
      </p>
    );
  }

  if (isError || !url) {
    return (
      <p className={`text-xs ${mine ? 'text-orange-100/80' : 'text-zinc-400'}`}>
        Could not load voice note
      </p>
    );
  }

  return (
    <div className="flex max-w-full items-center gap-2">
      <audio
        controls
        src={url}
        preload="metadata"
        className="max-w-[11rem] sm:max-w-[13rem]"
      >
        Your browser does not support audio playback.
      </audio>
      {durationLabel ? (
        <span
          className={`shrink-0 font-mono text-[11px] tabular-nums ${
            mine ? 'text-orange-100/80' : 'text-zinc-400'
          }`}
        >
          {durationLabel}
        </span>
      ) : null}
    </div>
  );
}

function MessageBody({ conversationId, message, mine }) {
  if (message.type === 'image' && message.attachment?.storedFilename) {
    return (
      <ImageAttachment
        conversationId={conversationId}
        attachment={message.attachment}
        mine={mine}
      />
    );
  }

  if (message.type === 'document' && message.attachment?.storedFilename) {
    return (
      <DocumentAttachment
        conversationId={conversationId}
        attachment={message.attachment}
        mine={mine}
      />
    );
  }

  if (message.type === 'voice' && message.attachment?.storedFilename) {
    return (
      <VoiceAttachment
        conversationId={conversationId}
        attachment={message.attachment}
        mine={mine}
      />
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words">
      {messagePreviewText(message)}
    </p>
  );
}

export default function DockedChatWindow({
  conversationId,
  contact,
  minimized,
  onClose,
  onToggleMinimize,
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    onPresenceUpdate,
    onMessageNew,
    onMessageSeen,
    onTypingUpdate,
    emitTyping,
  } = useChatSocket();

  const [contactOnline, setContactOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachError, setAttachError] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const typingTimeoutRef = useRef(null);
  const lastTypingEmitRef = useRef(0);
  const typingStopTimeoutRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastMarkSeenAtRef = useRef(0);
  const markSeenDebounceRef = useRef(null);
  const prevMinimizedRef = useRef(minimized);
  const scheduleMarkSeenRef = useRef(() => {});

  const contactId = contact?._id ?? contact?.id;
  const conversationIdRef = useRef(conversationId);
  const contactIdRef = useRef(contactId);
  conversationIdRef.current = conversationId;
  contactIdRef.current = contactId;

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => getMessages(conversationId),
    enabled: Boolean(conversationId) && !minimized,
  });

  const stopTyping = () => {
    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
    lastTypingEmitRef.current = 0;
    if (conversationId) {
      emitTyping(conversationId, false);
    }
  };

  const markSeenMutation = useMutation({
    mutationFn: () => markSeen(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const scheduleMarkSeen = (immediate = false) => {
    if (!conversationId) return;

    if (markSeenDebounceRef.current) {
      window.clearTimeout(markSeenDebounceRef.current);
      markSeenDebounceRef.current = null;
    }

    if (immediate) {
      lastMarkSeenAtRef.current = Date.now();
      markSeenMutation.mutate();
      return;
    }

    const now = Date.now();
    const elapsed = now - lastMarkSeenAtRef.current;

    // Fire at most once per 2s window (leading edge + trailing if burst continues)
    if (elapsed >= MARK_SEEN_WINDOW_MS) {
      lastMarkSeenAtRef.current = now;
      markSeenMutation.mutate();
      return;
    }

    markSeenDebounceRef.current = window.setTimeout(() => {
      markSeenDebounceRef.current = null;
      lastMarkSeenAtRef.current = Date.now();
      markSeenMutation.mutate();
    }, MARK_SEEN_WINDOW_MS - elapsed);
  };

  scheduleMarkSeenRef.current = scheduleMarkSeen;

  const sendMutation = useMutation({
    mutationFn: (text) =>
      sendMessage(conversationId, { type: 'text', text }),
    onSuccess: (data) => {
      const sent = data?.message ?? data;
      setDraft('');
      stopTyping();

      if (sent) {
        queryClient.setQueryData(['messages', conversationId], (old) => {
          const list = Array.isArray(old) ? old : [];
          if (list.some((m) => sameId(m._id, sent._id))) return list;
          return [...list, sent];
        });
      }

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const appendSentMessage = (data) => {
    const sent = data?.message ?? data;
    if (!sent) return;
    queryClient.setQueryData(['messages', conversationId], (old) => {
      const list = Array.isArray(old) ? old : [];
      if (list.some((m) => sameId(m._id, sent._id))) return list;
      return [...list, sent];
    });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const attachMutation = useMutation({
    mutationFn: async (file) => {
      const uploaded = await uploadFile(conversationId, file);
      const type = file.type?.startsWith('image/') ? 'image' : 'document';
      return sendMessage(conversationId, {
        type,
        attachment: {
          storedFilename: uploaded.storedFilename,
          originalName: uploaded.originalName,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
        },
      });
    },
    onMutate: () => {
      setAttachError('');
    },
    onSuccess: (data) => {
      appendSentMessage(data);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (err) => {
      setAttachError(
        err?.response?.data?.message ||
          err?.message ||
          'Could not upload file.'
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  const handleDraftChange = (value) => {
    setDraft(value);

    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }

    if (!value.trim()) {
      stopTyping();
      return;
    }

    const now = Date.now();
    if (now - lastTypingEmitRef.current >= TYPING_EMIT_THROTTLE_MS) {
      emitTyping(conversationId, true);
      lastTypingEmitRef.current = now;
    }

    typingStopTimeoutRef.current = window.setTimeout(() => {
      typingStopTimeoutRef.current = null;
      lastTypingEmitRef.current = 0;
      emitTyping(conversationId, false);
    }, TYPING_STOP_DEBOUNCE_MS);
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || sendMutation.isPending || attachMutation.isPending) return;
    sendMutation.mutate(text);
  };

  const handleAttachClick = () => {
    if (attachMutation.isPending || sendMutation.isPending) return;
    setAttachError('');
    fileInputRef.current?.click();
  };

  const handleFileSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    attachMutation.mutate(file);
  };

  const lastOwnMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (sameId(messages[i].senderId, user?._id)) {
        return messages[i]._id;
      }
    }
    return null;
  }, [messages, user?._id]);

  useLayoutEffect(() => {
    if (minimized) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, minimized]);

  useEffect(() => {
    const offPresence = onPresenceUpdate(({ userId, online }) => {
      if (!sameId(userId, contactId)) return;
      setContactOnline(Boolean(online));
    });
    return offPresence;
  }, [onPresenceUpdate, contactId]);

  // Mark seen when the window is toggled from minimized → open
  useEffect(() => {
    const wasMinimized = prevMinimizedRef.current;
    prevMinimizedRef.current = minimized;
    if (wasMinimized && !minimized) {
      scheduleMarkSeenRef.current(true);
    }
  }, [minimized]);

  useEffect(() => {
    if (minimized) return undefined;

    const offMessageNew = onMessageNew((message) => {
      const incoming =
        message?.conversationId != null
          ? message
          : message?.message || message;
      if (!incoming) return;
      if (!sameId(incoming.conversationId, conversationId)) return;

      queryClient.setQueryData(['messages', conversationId], (old) => {
        const list = Array.isArray(old) ? old : [];
        if (list.some((m) => sameId(m._id, incoming._id))) return list;
        return [...list, incoming];
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      // Contact message while this window is open → mark seen (debounced)
      if (
        sameId(incoming.senderId, contactId) &&
        !sameId(incoming.senderId, user?._id)
      ) {
        scheduleMarkSeenRef.current(false);
      }
    });

    const offMessageSeen = onMessageSeen((payload) => {
      if (!sameId(payload?.conversationId, conversationId)) return;
      const seenAt = payload.seenAt || new Date().toISOString();

      queryClient.setQueryData(['messages', conversationId], (old) => {
        const list = Array.isArray(old) ? old : [];
        let lastOwnIdx = -1;
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (sameId(list[i].senderId, user?._id)) {
            lastOwnIdx = i;
            break;
          }
        }
        if (lastOwnIdx < 0) return list;
        return list.map((m, i) =>
          i === lastOwnIdx ? { ...m, seenAt } : m
        );
      });
    });

    return () => {
      if (typingStopTimeoutRef.current) {
        window.clearTimeout(typingStopTimeoutRef.current);
        typingStopTimeoutRef.current = null;
      }
      if (markSeenDebounceRef.current) {
        window.clearTimeout(markSeenDebounceRef.current);
        markSeenDebounceRef.current = null;
      }
      offMessageNew();
      offMessageSeen();
    };
  }, [
    minimized,
    conversationId,
    contactId,
    user?._id,
    onMessageNew,
    onMessageSeen,
    queryClient,
  ]);

  // Isolated typing subscription — avoids tearing down on message-cache churn
  // and uses String() identity so ObjectId/string mismatches can't drop events.
  useEffect(() => {
    if (minimized) {
      setIsTyping(false);
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      return undefined;
    }

    const clearTypingSafety = () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };

    const offTyping = onTypingUpdate((payload) => {
      if (
        String(payload?.conversationId ?? '') !==
        String(conversationIdRef.current ?? '')
      ) {
        return;
      }
      if (
        String(payload?.userId ?? '') !==
        String(contactIdRef.current ?? '')
      ) {
        return;
      }

      clearTypingSafety();
      const typing = Boolean(payload?.isTyping);
      setIsTyping(typing);

      if (typing) {
        typingTimeoutRef.current = window.setTimeout(() => {
          setIsTyping(false);
          typingTimeoutRef.current = null;
        }, TYPING_SAFETY_MS);
      }
    });

    return () => {
      clearTypingSafety();
      offTyping();
    };
  }, [minimized, onTypingUpdate]);

  const header = (
    <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          contactOnline
            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
            : 'bg-zinc-600'
        }`}
        title={contactOnline ? 'Online' : 'Offline'}
      />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
        {contact?.fullName || 'Chat'}
      </p>
      <button
        type="button"
        onClick={onToggleMinimize}
        aria-label={minimized ? 'Expand chat' : 'Minimize chat'}
        className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      >
        {minimized ? '▢' : '—'}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close chat"
        className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      >
        ✕
      </button>
    </div>
  );

  if (minimized) {
    return (
      <div className="w-64 overflow-hidden rounded-t-xl border border-b-0 border-zinc-800/80 bg-zinc-950 shadow-2xl">
        {header}
      </div>
    );
  }

  return (
    <div className="flex h-[26rem] w-[20rem] flex-col overflow-hidden rounded-t-xl border border-b-0 border-zinc-800/80 bg-zinc-950 shadow-2xl sm:w-[22rem]">
      {header}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <p className="py-6 text-center text-xs text-zinc-500">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((message) => {
            const mine = sameId(message.senderId, user?._id);
            const showSeen =
              mine &&
              sameId(message._id, lastOwnMessageId) &&
              Boolean(message.seenAt);

            return (
              <div
                key={message._id}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                    mine
                      ? 'rounded-br-md bg-orange-600 text-white'
                      : 'rounded-bl-md bg-zinc-800 text-zinc-100'
                  }`}
                >
                  <MessageBody
                    conversationId={conversationId}
                    message={message}
                    mine={mine}
                  />
                  <p
                    className={`mt-1 text-[10px] ${
                      mine ? 'text-orange-100/70' : 'text-zinc-500'
                    }`}
                  >
                    {formatBubbleTime(message.createdAt)}
                  </p>
                </div>
                {showSeen ? (
                  <span className="mt-0.5 px-1 text-[10px] font-medium text-zinc-500">
                    Seen
                  </span>
                ) : null}
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      {isTyping ? (
        <div className="px-3 py-1 text-xs italic text-zinc-400">typing...</div>
      ) : null}

      {attachError ? (
        <p className="px-3 py-1 text-[11px] text-red-400">{attachError}</p>
      ) : null}

      <form
        className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/80 px-2 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (voiceMode) return;
          handleSend();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip"
          className="hidden"
          onChange={handleFileSelected}
        />
        <button
          type="button"
          onClick={handleAttachClick}
          disabled={
            attachMutation.isPending ||
            sendMutation.isPending ||
            voiceMode
          }
          aria-label="Attach file"
          title="Attach file"
          className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {attachMutation.isPending ? '…' : '📎'}
        </button>
        <button
          type="button"
          onClick={() => {
            stopTyping();
            setVoiceMode((open) => !open);
          }}
          disabled={attachMutation.isPending || sendMutation.isPending}
          aria-label={voiceMode ? 'Cancel voice note' : 'Record voice note'}
          title={voiceMode ? 'Cancel voice note' : 'Record voice note'}
          aria-pressed={voiceMode}
          className={`cursor-pointer rounded-lg border px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
            voiceMode
              ? 'border-orange-500/60 bg-orange-600/20 text-orange-300'
              : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
          }`}
        >
          🎤
        </button>

        {voiceMode ? (
          <VoiceRecorder
            conversationId={conversationId}
            onSent={() => setVoiceMode(false)}
          />
        ) : (
          <>
            <input
              type="text"
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onBlur={stopTyping}
              placeholder="Type a message…"
              disabled={sendMutation.isPending || attachMutation.isPending}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-orange-500/60"
            />
            <button
              type="submit"
              disabled={
                !draft.trim() ||
                sendMutation.isPending ||
                attachMutation.isPending
              }
              aria-label="Send message"
              className="cursor-pointer rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </>
        )}
      </form>
    </div>
  );
}
