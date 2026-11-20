import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  addClientComment,
  clientCommentAttachmentUrl,
} from '../../services/handover.service.js';
import { getUsers } from '../../services/lead.service.js';
import api from '../../config/api.config.js';
import useAuth from '../../hooks/useAuth.hook.js';

const fieldClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

const MENTION_ROLES = new Set([
  'closer',
  'tech_team',
  'super_admin',
  'admin',
  'sales_agent',
  'cst_manager',
]);

const roleLabel = (role) => {
  if (role === 'tech_team') return 'Tech';
  if (role === 'sales_agent') return 'Agent';
  if (role === 'super_admin' || role === 'admin') return 'Admin';
  if (role === 'closer') return 'Closer';
  if (role === 'cst_manager') return 'CST';
  return role || 'User';
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
 * Client Detail → Comments (@mentions + PDF/Docs/Images attachments).
 */
export default function CstClientComments({ lead, onLeadUpdated }) {
  const { user } = useAuth();
  const textareaRef = useRef(null);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [mentionIds, setMentionIds] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['mentionUsers'],
    queryFn: () => getUsers({ status: 'approved' }),
    staleTime: 60_000,
  });

  const mentionable = useMemo(
    () =>
      (users || []).filter(
        (u) =>
          MENTION_ROLES.has(u.role) &&
          String(u._id) !== String(user?._id || user?.id)
      ),
    [users, user]
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

  const comments = useMemo(() => {
    const rows = Array.isArray(lead?.handover?.comments)
      ? [...lead.handover.comments]
      : [];
    return rows.sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }, [lead?.handover?.comments]);

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
    const match = before.match(/@([\w.\-]*)$/);
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
    const replaced = before.replace(/@([\w.\-]*)$/, `@${u.username || u.fullName} `);
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

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-white">
          Comments
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Type @ to mention Closer, Tech, Admin, or Agent — they get a live
          alert. Attach PDF, Docs, or Images.
        </p>

        <div className="relative mt-4">
          <textarea
            ref={textareaRef}
            rows={4}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="Write a comment… use @ to mention teammates"
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

      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            No comments yet.
          </p>
        ) : (
          comments.map((c) => {
            const author =
              c.createdBy?.fullName ||
              c.createdBy?.username ||
              'Team member';
            return (
              <article
                key={c.commentId}
                className="rounded-2xl border border-zinc-800/80 bg-[#111111] px-4 py-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{author}</p>
                  <p className="text-xs text-zinc-500">
                    {formatPkt(c.createdAt)} PKT
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">
                  {c.body}
                </p>
                {Array.isArray(c.mentions) && c.mentions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.mentions.map((m) => (
                      <span
                        key={String(m.userId)}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
                      >
                        @{m.username || m.fullName} · {roleLabel(m.role)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {Array.isArray(c.attachments) && c.attachments.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.attachments.map((f) => (
                      <button
                        key={f.storedFilename}
                        type="button"
                        onClick={() => openAttachment(c, f)}
                        className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-semibold text-[#F25E26] hover:bg-[#F25E26]/10"
                      >
                        {f.originalName || f.storedFilename}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
