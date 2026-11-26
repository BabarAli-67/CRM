import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addClientComment,
  clientCommentAttachmentUrl,
  deleteClientCommentAttachment,
  markClientCommentsRead,
} from '../../services/handover.service.js';
import { getUsers } from '../../services/lead.service.js';
import api from '../../config/api.config.js';
import useAuth from '../../hooks/useAuth.hook.js';

const fieldClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

/** CST Manager may only @mention Tech Head (never individual specialists). */
const CST_MENTION_ROLES = new Set(['tech_head']);
/** Tech Team may only @mention Tech Head (never CST — privacy). */
const TECH_TEAM_MENTION_ROLES = new Set(['tech_head']);
/** Tech Head may mention CST or assigned specialists. */
const TECH_HEAD_MENTION_ROLES = new Set(['cst_manager', 'tech_team']);

const roleLabel = (role) => {
  if (role === 'tech_team') return 'TECH';
  if (role === 'tech_head') return 'TECH HEAD';
  if (role === 'cst_manager') return 'CST';
  if (role === 'super_admin') return 'ADMIN';
  if (role === 'admin') return 'ADMIN';
  if (role === 'closer') return 'CLOSER';
  if (role === 'sales_agent') return 'AGENT';
  return String(role || 'USER').replace(/_/g, ' ').toUpperCase();
};

const commentAuthorId = (comment) => {
  const by = comment?.createdBy;
  if (!by) return null;
  if (typeof by === 'object' && by._id != null) return String(by._id);
  return String(by);
};

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Shared client comment thread (CST Manager ↔ Tech Team).
 * Marks comments as read for the current user while this panel is open.
 */
export default function CstClientComments({ lead, onLeadUpdated }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const textareaRef = useRef(null);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [mentionIds, setMentionIds] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const isCstAuthor = user?.role === 'cst_manager';
  const isTechHead = user?.role === 'tech_head';
  const allowedMentionRoles = isCstAuthor
    ? CST_MENTION_ROLES
    : isTechHead
      ? TECH_HEAD_MENTION_ROLES
      : TECH_TEAM_MENTION_ROLES;

  const assignedSpecialistIds = useMemo(() => {
    const ids = new Set();
    const multi = Array.isArray(lead?.handover?.assignedTechIds)
      ? lead.handover.assignedTechIds
      : [];
    for (const t of multi) {
      const id = typeof t === 'object' ? t?._id : t;
      if (id) ids.add(String(id));
    }
    const legacy = lead?.handover?.assignedTechId;
    const legacyId = typeof legacy === 'object' ? legacy?._id : legacy;
    if (legacyId) ids.add(String(legacyId));
    return ids;
  }, [lead?.handover?.assignedTechIds, lead?.handover?.assignedTechId]);

  const { data: users = [] } = useQuery({
    queryKey: [
      'mentionUsers',
      isCstAuthor
        ? 'cst-tech-head'
        : isTechHead
          ? 'tech-head-cst-team'
          : 'tech-team-tech-head',
    ],
    queryFn: () => getUsers({ status: 'approved' }),
    staleTime: 60_000,
  });

  const mentionable = useMemo(
    () =>
      (users || []).filter((u) => {
        if (String(u._id) === String(user?._id || user?.id)) return false;
        if (!allowedMentionRoles.has(u.role)) return false;
        if (isTechHead && u.role === 'tech_team') {
          return assignedSpecialistIds.has(String(u._id));
        }
        return true;
      }),
    [users, user, allowedMentionRoles, isTechHead, assignedSpecialistIds]
  );

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return mentionable.slice(0, 8);
    return mentionable
      .filter((u) => {
        const hay = `${u.fullName || ''} ${u.username || ''} ${u.role || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [mentionable, mentionQuery]);

  const currentUserId = String(user?._id || user?.id || '');
  const isTechTeam = user?.role === 'tech_team';

  const comments = useMemo(() => {
    const raw = Array.isArray(lead?.handover?.comments)
      ? [...lead.handover.comments]
      : [];

    const isForwardHandoff = (c) =>
      /^\[Forwarded from CST/i.test(String(c?.body || '').trim());

    const resolveVisibility = (c) => {
      if (c?.visibility === 'cst' || c?.visibility === 'tech' || c?.visibility === 'both') {
        return c.visibility;
      }
      const r = c?.createdBy?.role;
      if (r === 'tech_team') return 'tech';
      if (r === 'cst_manager') return 'cst';
      if (r === 'tech_head' || r === 'super_admin' || r === 'admin') {
        if (isForwardHandoff(c)) return 'tech';
        const mentions = Array.isArray(c?.mentions) ? c.mentions : [];
        const hasTech = mentions.some((m) => m?.role === 'tech_team');
        const hasCst = mentions.some((m) => m?.role === 'cst_manager');
        if (hasTech && hasCst) return 'both';
        if (hasTech) return 'tech';
        return 'cst';
      }
      return 'both';
    };

    // Department privacy (matches backend lane filter; no synthetic task-note bubbles)
    const visible = raw.filter((c) => {
      const r = c?.createdBy?.role;
      if (isCstAuthor) {
        if (r === 'tech_team') return false;
        if (isForwardHandoff(c)) return false;
        const v = resolveVisibility(c);
        return v === 'cst' || v === 'both';
      }
      if (isTechTeam) {
        if (r === 'cst_manager') return false;
        if (r === 'tech_team') return true;
        const v = resolveVisibility(c);
        return v === 'tech' || v === 'both';
      }
      return true;
    });

    // Chat order: oldest → newest
    return visible.sort(
      (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    );
  }, [lead?.handover?.comments, isCstAuthor, isTechTeam]);

  // Mark thread as read while the Comments tab is open
  useEffect(() => {
    if (!lead?._id) return undefined;
    let cancelled = false;

    const markRead = async () => {
      try {
        await markClientCommentsRead(lead._id);
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
        queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
        queryClient.invalidateQueries({ queryKey: ['techHeadTeamComments'] });
        queryClient.invalidateQueries({ queryKey: ['techHeadEscalations'] });
        queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
        queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
        queryClient.invalidateQueries({ queryKey: ['myProjects'] });
        onLeadUpdated?.({
          ...lead,
          unreadCommentCount: 0,
        });
      } catch {
        // Non-blocking — user can still read/post
      }
    };

    markRead();
    return () => {
      cancelled = true;
    };
    // Re-run when lead id changes or a new comment arrives while viewing
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mark on open + comment count change
  }, [lead?._id, comments.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setShowMentions(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const mutation = useMutation({
    mutationFn: () =>
      addClientComment(lead._id, {
        body: body.trim(),
        mentionIds,
        files,
      }),
    onSuccess: (updated) => {
      setBody('');
      setFiles([]);
      setMentionIds([]);
      setMentionQuery('');
      setShowMentions(false);
      setError('');
      setMessage('Comment posted.');
      onLeadUpdated?.(updated);
      queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadTeamComments'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadEscalations'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
    },
    onError: (err) => {
      setMessage('');
      setError(err?.response?.data?.message || 'Failed to post comment.');
    },
  });

  const onBodyChange = (value) => {
    setBody(value);
    setError('');
    setMessage('');
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/@([\w.-]*)$/);
    if (match) {
      setShowMentions(true);
      setMentionQuery(match[1] || '');
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  };

  const insertMention = (u) => {
    const el = textareaRef.current;
    const value = body;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(/@([\w.-]*)$/, `@${u.username || u.fullName} `);
    setBody(replaced + after);
    setMentionIds((prev) =>
      prev.includes(String(u._id)) ? prev : [...prev, String(u._id)]
    );
    setShowMentions(false);
    setMentionQuery('');
    requestAnimationFrame(() => {
      el?.focus();
    });
  };

  const openAttachment = async (comment, file) => {
    try {
      const url = clientCommentAttachmentUrl(
        lead._id,
        comment.commentId,
        file.storedFilename
      );
      const response = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      setError('Failed to open attachment.');
    }
  };

  const isImageAttachment = (file) =>
    String(file?.mimeType || '').toLowerCase().startsWith('image/');

  const canDeleteAttachment = (comment) => {
    const authorId = commentAuthorId(comment);
    if (authorId && authorId === String(user?._id || user?.id || '')) {
      return true;
    }
    return (
      user?.role === 'cst_manager' ||
      user?.role === 'tech_head' ||
      user?.role === 'super_admin' ||
      user?.role === 'admin'
    );
  };

  const deleteAttachmentMutation = useMutation({
    mutationFn: ({ commentId, filename }) =>
      deleteClientCommentAttachment(lead._id, commentId, filename),
    onSuccess: (updatedLead) => {
      setError('');
      setMessage('Image deleted.');
      onLeadUpdated?.(updatedLead);
      queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
    },
    onError: (err) => {
      setMessage('');
      setError(err?.response?.data?.message || 'Failed to delete image.');
    },
  });

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-white">
          Comments
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {isCstAuthor
            ? 'CST ↔ Tech Head only — every comment alerts Tech Head. Optional @Tech Head. Attach PDF, Docs, or Images.'
            : isTechHead
              ? 'Hub thread — reply to CST or forward work to specialists. Type @ to mention CST or an assigned specialist.'
              : 'Tech Head ↔ Tech Team only — replies alert Tech Head (hidden from CST). Attach PDF, Docs, or Images.'}
        </p>

        <div className="relative mt-4">
          <textarea
            ref={textareaRef}
            rows={4}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder={
              isCstAuthor
                ? 'Write a comment for Tech Head…'
                : isTechHead
                  ? 'Write a comment… use @ to mention CST or a specialist'
                  : 'Write a comment for Tech Head…'
            }
            className={`${fieldClass} resize-y`}
          />
          {showMentions && filteredMentions.length > 0 ? (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-zinc-700 bg-[#0A0A0A] shadow-xl">
              {filteredMentions.map((u) => (
                <li key={u._id}>
                  <button
                    type="button"
                    onClick={() => insertMention(u)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white hover:bg-[#F25E26]/15"
                  >
                    <span>
                      {u.fullName || u.username}
                      <span className="ml-2 text-xs text-zinc-500">
                        @{u.username}
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#F25E26]">
                      {roleLabel(u.role)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {mentionIds.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mentionIds.map((id) => {
              const u = mentionable.find((x) => String(x._id) === String(id));
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-[#F25E26]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#F25E26] ring-1 ring-[#F25E26]/35"
                >
                  @{u?.username || u?.fullName || id}
                  <button
                    type="button"
                    aria-label="Remove mention"
                    onClick={() =>
                      setMentionIds((prev) => prev.filter((x) => x !== id))
                    }
                    className="ml-0.5 text-zinc-400 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          {files.length > 0 ? (
            <span className="text-xs text-zinc-500">
              {files.length} file{files.length === 1 ? '' : 's'} selected
            </span>
          ) : null}
          <button
            type="button"
            disabled={mutation.isPending || !body.trim()}
            onClick={() => mutation.mutate()}
            className="ml-auto rounded-xl bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff6a36] disabled:opacity-60"
          >
            {mutation.isPending ? 'Posting…' : 'Post Comment'}
          </button>
        </div>

        {error ? (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-2 text-sm text-emerald-400" role="status">
            {message}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-[#0A0A0A]/80 p-3 sm:p-4">
        {comments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            No comments yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((c) => {
              const authorId = commentAuthorId(c);
              const isOwn =
                Boolean(currentUserId) &&
                Boolean(authorId) &&
                authorId === currentUserId;
              const authorName =
                c.createdBy?.fullName ||
                c.createdBy?.username ||
                'Team member';
              const authorRole = c.createdBy?.role;

              return (
                <li
                  key={c.commentId}
                  className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <article
                    className={`w-fit max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:px-4 sm:py-3 ${
                      isOwn
                        ? 'rounded-br-md bg-[#F25E26]/15 ring-1 ring-[#F25E26]/35'
                        : 'rounded-bl-md bg-zinc-900/90 ring-1 ring-zinc-700/70'
                    }`}
                  >
                    <div
                      className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${
                        isOwn ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <p
                        className={`text-sm font-semibold ${
                          isOwn ? 'text-[#ffb899]' : 'text-white'
                        }`}
                      >
                        {isOwn ? 'You' : authorName}
                      </p>
                      {authorRole ? (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            isOwn
                              ? 'bg-[#F25E26]/25 text-[#F25E26]'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {roleLabel(authorRole)}
                        </span>
                      ) : null}
                      <p className="text-[11px] text-zinc-500">
                        {formatPkt(c.createdAt)} PKT
                      </p>
                    </div>

                    <p
                      className={`mt-1.5 whitespace-pre-wrap text-sm leading-relaxed ${
                        isOwn ? 'text-orange-50' : 'text-zinc-200'
                      }`}
                    >
                      {c.body}
                    </p>

                    {Array.isArray(c.mentions) && c.mentions.length > 0 ? (
                      <div
                        className={`mt-2 flex flex-wrap gap-1.5 ${
                          isOwn ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {c.mentions.map((m) => (
                          <span
                            key={String(m.userId)}
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              isOwn
                                ? 'bg-[#F25E26]/20 text-[#ffc4a8]'
                                : 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            @{m.username || m.fullName} · {roleLabel(m.role)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {Array.isArray(c.attachments) && c.attachments.length > 0 ? (
                      <div
                        className={`mt-2.5 flex flex-wrap gap-2 ${
                          isOwn ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {c.attachments.map((f) => {
                          const showDelete =
                            isImageAttachment(f) && canDeleteAttachment(c);
                          const deleting =
                            deleteAttachmentMutation.isPending &&
                            deleteAttachmentMutation.variables?.commentId ===
                              c.commentId &&
                            deleteAttachmentMutation.variables?.filename ===
                              f.storedFilename;
                          return (
                            <div
                              key={f.storedFilename}
                              className="inline-flex items-center gap-1"
                            >
                              <button
                                type="button"
                                onClick={() => openAttachment(c, f)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                                  isOwn
                                    ? 'border border-[#F25E26]/40 bg-[#F25E26]/10 text-[#ffb899] hover:bg-[#F25E26]/20'
                                    : 'border border-zinc-700 text-[#F25E26] hover:bg-[#F25E26]/10'
                                }`}
                              >
                                {f.originalName || f.storedFilename}
                              </button>
                              {showDelete ? (
                                <button
                                  type="button"
                                  disabled={deleteAttachmentMutation.isPending}
                                  onClick={() =>
                                    deleteAttachmentMutation.mutate({
                                      commentId: c.commentId,
                                      filename: f.storedFilename,
                                    })
                                  }
                                  className="rounded-lg border border-red-500/40 px-2 py-1 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
                                >
                                  {deleting ? 'Deleting…' : 'Delete'}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
